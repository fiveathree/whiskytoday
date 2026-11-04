// Public whisky catalogue (owner decision 2026-11-04). Only public fields leave this module:
// never cost, private notes, provenance, bottles, target / floor price, investor card or non-public prices / media.
import { json } from './db.js';
import { loadConverter } from './rescore.js';

const PAGE = 9;
// Explicit allow-list of edition columns that may be shown to anyone.
const PUBLIC_COLS = `e.id, e.slug, e.name_en, e.name_zh, e.category, e.vintage_year, e.bottling_year, e.age_years, e.cask_type,
  e.cask_number, e.edition_size, e.abv, e.volume_ml, e.description_zh, e.description_en, e.tasting_zh, e.tasting_en,
  e.owner_comment_zh, e.owner_comment_en, e.is_demo, e.updated_at,
  d.name_en AS distillery_en, d.name_zh AS distillery_zh, d.status AS distillery_status, d.region AS region`;
const SOLD = "('auction_total','private_sale','auction_hammer')";

function cached(res, seconds = 60) {
  res.headers.set('cache-control', `public, max-age=${seconds}`);
  return res;
}

// Latest score per edition, reduced to Tier and total (no component breakdown in public).
async function tierMap(env, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.DB.prepare(
    `SELECT s.edition_id, s.status, s.total, s.tier FROM scores s
     JOIN (SELECT edition_id, MAX(computed_at) AS m FROM scores WHERE edition_id IN (${ids.map(() => '?').join(',')}) GROUP BY edition_id) l
       ON l.edition_id = s.edition_id AND l.m = s.computed_at`,
  ).bind(...ids).all();
  return new Map(results.map((r) => [r.edition_id, r.status === 'scored' ? { tier: r.tier, total: r.total } : { status: r.status }]));
}

export async function listCatalog(env, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60).replace(/[%_]/g, '');
  const tier = url.searchParams.get('tier');
  const cat = (url.searchParams.get('category') || '').trim().slice(0, 40);
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const like = `%${q}%`;
  const { results: all } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLS} FROM editions e LEFT JOIN entities d ON d.id = e.distillery_id
     WHERE (? = '' OR e.name_en LIKE ? OR e.name_zh LIKE ? OR d.name_en LIKE ? OR d.name_zh LIKE ?)
       AND (? = '' OR e.category = ?)
     ORDER BY e.is_demo, e.updated_at DESC`,
  ).bind(q, like, like, like, like, cat, cat).all();
  const tiers = await tierMap(env, all.map((e) => e.id));
  let rows = all.map((e) => ({ ...e, score: tiers.get(e.id) || null }));
  if (['A', 'B', 'C', 'low'].includes(tier)) rows = rows.filter((r) => r.score?.tier === tier);
  const total = rows.length;
  rows = rows.slice((page - 1) * PAGE, page * PAGE);
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    const [{ results: prices }, { results: photos }, { results: ratings }] = await Promise.all([
      env.DB.prepare(`SELECT edition_id, amount_minor, currency, observed_at FROM prices
        WHERE is_public = 1 AND amount_minor IS NOT NULL AND price_type IN ${SOLD} AND edition_id IN (${marks})`).bind(...ids).all(),
      env.DB.prepare(`SELECT id, edition_id FROM media WHERE is_public = 1 AND kind = 'photo' AND content_type LIKE 'image/%' AND edition_id IN (${marks})`).bind(...ids).all(),
      env.DB.prepare(`SELECT edition_id, source, score, scale, award FROM ratings WHERE is_public = 1 AND edition_id IN (${marks}) ORDER BY created_at`).bind(...ids).all(),
    ]);
    const convert = await loadConverter(env, prices.map((p) => p.currency));
    for (const r of rows) {
      const last = prices.filter((p) => p.edition_id === r.id).sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
      r.lastPublicHkd = last ? convert(last.amount_minor, last.currency, last.observed_at) : null;
      r.lastPublicDate = last?.observed_at?.slice(0, 10) || null;
      r.photo = photos.find((m) => m.edition_id === r.id)?.id || null;
      r.ratings = ratings.filter((x) => x.edition_id === r.id).slice(0, 2).map(({ edition_id, ...x }) => x);
      delete r.description_zh; delete r.description_en; delete r.tasting_zh; delete r.tasting_en;
      delete r.owner_comment_zh; delete r.owner_comment_en;
    }
  }
  const { results: cats } = await env.DB.prepare('SELECT DISTINCT category FROM editions WHERE category IS NOT NULL ORDER BY category').all();
  return cached(json({ rows, total, page, pageSize: PAGE, categories: cats.map((c) => c.category) }));
}

export async function getCatalogItem(env, slug) {
  const e = await env.DB.prepare(`SELECT ${PUBLIC_COLS}, e.distillery_id, e.brand_id FROM editions e
    LEFT JOIN entities d ON d.id = e.distillery_id WHERE e.slug = ?`).bind(String(slug).slice(0, 120)).first();
  if (!e) return json({ error: 'not found' }, 404);
  const [{ results: prices }, { results: media }, { results: news }, tiers, { results: ratings }] = await Promise.all([
    env.DB.prepare(`SELECT price_type, amount_minor, currency, market, venue, lot_number, observed_at FROM prices
      WHERE edition_id = ? AND is_public = 1 AND amount_minor IS NOT NULL ORDER BY observed_at`).bind(e.id).all(),
    env.DB.prepare('SELECT id, kind, caption, content_type FROM media WHERE edition_id = ? AND is_public = 1').bind(e.id).all(),
    env.DB.prepare(`SELECT DISTINCT a.id, a.title_zh, a.title_en, a.summary_zh, a.summary_en, a.canonical_url, COALESCE(a.published_at, a.fetched_at) AS d
      FROM article_entities ae JOIN articles a ON a.id = ae.article_id
      WHERE a.status = 'published' AND ae.entity_id IN (?, ?) ORDER BY d DESC LIMIT 8`).bind(e.distillery_id || '', e.brand_id || '').all(),
    tierMap(env, [e.id]),
    env.DB.prepare('SELECT source, score, scale, votes, award, url, rated_at FROM ratings WHERE edition_id = ? AND is_public = 1 ORDER BY created_at').bind(e.id).all(),
  ]);
  const convert = await loadConverter(env, [...prices.map((p) => p.currency), 'USD']);
  const out = prices.map((p) => {
    const hkd = convert(p.amount_minor, p.currency, p.observed_at);
    const usdRate = convert(100, 'USD', p.observed_at);
    return { ...p, hkd_minor: hkd, usd_minor: hkd != null && usdRate ? Math.round((hkd * 100) / usdRate) : null, observed_at: p.observed_at.slice(0, 10) };
  });
  delete e.distillery_id;
  delete e.brand_id;
  return cached(json({ edition: e, score: tiers.get(e.id) || null, prices: out, media, news, ratings }));
}

// Public media: served only when the file is marked public.
export async function getPublicMedia(env, id) {
  const m = await env.DB.prepare('SELECT r2_key, content_type FROM media WHERE id = ? AND is_public = 1').bind(id).first();
  if (!m || !env.MEDIA) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(m.r2_key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': m.content_type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } });
}

