// Admin API for editions, bottles, prices, media, scores and settings (PLAN §5, §6). Admin only:
// routed from /api/admin/*, which is behind Access and re-checked in worker.js and api.js.
import { json, uid, nowIso, getSettings } from './db.js';
import { parseCsv, validatePrice, CSV_COLUMNS, CURRENCIES } from './csv.js';
import { rescoreEdition, loadConverter } from './rescore.js';
import { median } from './score.js';
import { seedDemo, clearDemo } from './demo.js';
import { aiDraft } from './aidraft.js';

const PAGE = 15;
const EDITION_TEXT = ['name_en', 'name_zh', 'category', 'cask_type', 'cask_number', 'description_zh', 'description_en',
  'tasting_zh', 'tasting_en', 'owner_comment_zh', 'owner_comment_en'];
const EDITION_INT = ['vintage_year', 'bottling_year', 'age_years', 'edition_size', 'volume_ml', 'holding_months'];
const BOTTLE_TEXT = ['bottle_number', 'fill_level', 'seal_condition', 'label_condition', 'box_condition', 'provenance_note', 'private_note'];
const MAX_UPLOAD = 10 * 1024 * 1024;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const toInt = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const toMinor = (v) => (v === '' || v == null ? null : /^\d+(\.\d{1,2})?$/.test(String(v).replace(/,/g, '')) ? Math.round(Number(String(v).replace(/,/g, '')) * 100) : null);
const cur = (v) => (CURRENCIES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : null);
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || uid().slice(0, 8);

async function body(request) { try { return await request.json(); } catch { return {}; } }

async function entityOrNull(env, id) {
  if (!id) return null;
  return (await env.DB.prepare('SELECT id FROM entities WHERE id = ?').bind(id).first('id')) || null;
}

function editionValues(b) {
  const v = {};
  for (const k of EDITION_TEXT) if (k in b) v[k] = String(b[k] ?? '').trim().slice(0, k.startsWith('description') || k.startsWith('tasting') || k.startsWith('owner') ? 4000 : 200) || null;
  for (const k of EDITION_INT) if (k in b) v[k] = toInt(b[k]);
  if ('abv' in b) v.abv = b.abv === '' || b.abv == null ? null : Number(b.abv);
  if ('target_price' in b) { v.target_price_minor = toMinor(b.target_price); v.target_currency = cur(b.target_currency); }
  if ('floor_price' in b) { v.floor_price_minor = toMinor(b.floor_price); v.floor_currency = cur(b.floor_currency); }
  if ('is_tracked' in b) v.is_tracked = b.is_tracked ? 1 : 0;
  return v;
}

async function latestScores(env, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.DB.prepare(
    `SELECT s.* FROM scores s JOIN (SELECT edition_id, MAX(computed_at) AS m FROM scores WHERE edition_id IN (${ids.map(() => '?').join(',')}) GROUP BY edition_id) l
     ON l.edition_id = s.edition_id AND l.m = s.computed_at`,
  ).bind(...ids).all();
  return new Map(results.map((r) => [r.edition_id, r]));
}

// Scan table (§5 "/scores"): edition + latest score + last sale in HKD + 12-month change + latest news date.
async function listEditions(env, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const tier = url.searchParams.get('tier');
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const { results: all } = await env.DB.prepare(
    `SELECT e.id, e.slug, e.name_en, e.name_zh, e.category, e.is_demo, e.distillery_id, e.brand_id, d.name_en AS distillery_en, d.name_zh AS distillery_zh
     FROM editions e LEFT JOIN entities d ON d.id = e.distillery_id
     WHERE (? = '' OR e.name_en LIKE ? OR e.name_zh LIKE ? OR d.name_en LIKE ? OR d.name_zh LIKE ?)
     ORDER BY e.updated_at DESC`,
  ).bind(q, like, like, like, like).all();
  const scores = await latestScores(env, all.map((e) => e.id));
  let rows = all.map((e) => ({ ...e, score: scores.get(e.id) || null }));
  const summary = {
    tracked: rows.length,
    scored: rows.filter((r) => r.score?.status === 'scored').length,
    insufficient: rows.filter((r) => !r.score || r.score.status === 'insufficient_data').length,
    review: rows.filter((r) => r.score?.status === 'needs_review').length,
  };
  if (['A', 'B', 'C', 'low'].includes(tier)) rows = rows.filter((r) => r.score?.tier === tier);
  const sort = url.searchParams.get('sort');
  if (sort === 'score') rows.sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));
  const total = rows.length;
  rows = rows.slice((page - 1) * PAGE, page * PAGE);

  // Per-row market numbers for the visible page only.
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const { results: prices } = await env.DB.prepare(
      `SELECT edition_id, amount_minor, currency, observed_at FROM prices
       WHERE edition_id IN (${ids.map(() => '?').join(',')}) AND price_type IN ('auction_total','private_sale') AND amount_minor IS NOT NULL`,
    ).bind(...ids).all();
    const convert = await loadConverter(env, prices.map((p) => p.currency));
    const { results: newsDates } = await env.DB.prepare(
      `SELECT e.id, MAX(COALESCE(a.published_at, a.fetched_at)) AS d FROM editions e
       JOIN article_entities ae ON ae.entity_id IN (e.distillery_id, e.brand_id) JOIN articles a ON a.id = ae.article_id AND a.status = 'published'
       WHERE e.id IN (${ids.map(() => '?').join(',')}) GROUP BY e.id`,
    ).bind(...ids).all();
    const nd = new Map(newsDates.map((r) => [r.id, r.d]));
    const now = Date.now();
    for (const r of rows) {
      const ps = prices.filter((p) => p.edition_id === r.id).map((p) => ({ hkd: convert(p.amount_minor, p.currency, p.observed_at), t: Date.parse(p.observed_at) }))
        .filter((p) => p.hkd != null).sort((a, b) => b.t - a.t);
      r.lastSaleHkd = ps[0]?.hkd ?? null;
      const m12 = median(ps.filter((p) => p.t >= now - 365 * 86400_000).map((p) => p.hkd));
      const m24 = median(ps.filter((p) => p.t < now - 365 * 86400_000 && p.t >= now - 730 * 86400_000).map((p) => p.hkd));
      r.change12 = m12 != null && m24 ? m12 / m24 - 1 : null;
      r.lastNews = nd.get(r.id) || null;
    }
  }
  return json({ rows, total, page, pageSize: PAGE, summary });
}

async function getEdition(env, id) {
  const e = await env.DB.prepare('SELECT * FROM editions WHERE id = ?').bind(id).first();
  if (!e) return json({ error: 'not found' }, 404);
  const [bottles, prices, media, scores, news] = await Promise.all([
    env.DB.prepare('SELECT * FROM bottles WHERE edition_id = ? ORDER BY created_at').bind(id).all(),
    env.DB.prepare('SELECT * FROM prices WHERE edition_id = ? ORDER BY observed_at').bind(id).all(),
    env.DB.prepare('SELECT id, bottle_id, kind, is_public, caption, content_type FROM media WHERE edition_id = ?').bind(id).all(),
    env.DB.prepare('SELECT * FROM scores WHERE edition_id = ? ORDER BY computed_at DESC LIMIT 1').bind(id).all(),
    env.DB.prepare(
      `SELECT DISTINCT a.id, a.title_zh, a.title_en, a.category, a.investor_focus, COALESCE(a.published_at, a.fetched_at) AS d
       FROM article_entities ae JOIN articles a ON a.id = ae.article_id
       WHERE a.status = 'published' AND ae.entity_id IN (?, ?) ORDER BY d DESC LIMIT 12`,
    ).bind(e.distillery_id || '', e.brand_id || '').all(),
  ]);
  const convert = await loadConverter(env, prices.results.map((p) => p.currency));
  const pricesOut = prices.results.map((p) => ({ ...p, hkd_minor: convert(p.amount_minor, p.currency, p.observed_at) }));
  // USD view: HKD amount divided by the USD rate of the same day.
  const usdConvert = await loadConverter(env, ['USD']);
  for (const p of pricesOut) {
    const usdPerHkd = usdConvert(100, 'USD', p.observed_at);
    p.usd_minor = p.hkd_minor != null && usdPerHkd ? Math.round((p.hkd_minor * 100) / usdPerHkd) : null;
  }
  const score = scores.results[0] || null;
  let inputs = null;
  try { inputs = score ? JSON.parse(score.inputs_json) : null; } catch { /* ignore */ }
  return json({ edition: e, bottles: bottles.results, prices: pricesOut, media: media.results, score, card: inputs?.card || null, news: news.results });
}

async function saveEdition(env, id, b) {
  const v = editionValues(b);
  if ('distillery_id' in b) v.distillery_id = await entityOrNull(env, b.distillery_id);
  if ('brand_id' in b) v.brand_id = await entityOrNull(env, b.brand_id);
  if ('bottler_id' in b) v.bottler_id = await entityOrNull(env, b.bottler_id);
  const now = nowIso();
  if (!id) {
    if (!v.name_en) return json({ error: '英文名稱必填' }, 400);
    id = uid();
    let slug = slugify(`${v.name_en}-${v.bottling_year || v.vintage_year || ''}`);
    if (await env.DB.prepare('SELECT 1 FROM editions WHERE slug = ?').bind(slug).first()) slug = `${slug}-${id.slice(0, 4)}`;
    const cols = ['id', 'slug', 'created_at', 'updated_at', ...Object.keys(v)];
    await env.DB.prepare(`INSERT INTO editions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .bind(id, slug, now, now, ...Object.values(v)).run();
  } else {
    if (!Object.keys(v).length) return json({ ok: true, id });
    if ('name_en' in v && !v.name_en) return json({ error: '英文名稱必填' }, 400);
    const sets = Object.keys(v).map((k) => `${k} = ?`).join(', ');
    const r = await env.DB.prepare(`UPDATE editions SET ${sets}, updated_at = ? WHERE id = ?`).bind(...Object.values(v), now, id).run();
    if (!r.meta.changes) return json({ error: 'not found' }, 404);
  }
  await rescoreEdition(env, id);
  return json({ ok: true, id });
}

async function deleteEdition(env, id) {
  const { results: media } = await env.DB.prepare('SELECT r2_key FROM media WHERE edition_id = ?').bind(id).all();
  for (const m of media) await env.MEDIA?.delete(m.r2_key);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scores WHERE edition_id = ?').bind(id),
    env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(id),
    env.DB.prepare('DELETE FROM media WHERE edition_id = ?').bind(id),
    env.DB.prepare('DELETE FROM bottles WHERE edition_id = ?').bind(id),
    env.DB.prepare('DELETE FROM editions WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function saveBottle(env, editionId, bottleId, b) {
  const v = {};
  for (const k of BOTTLE_TEXT) if (k in b) v[k] = String(b[k] ?? '').trim().slice(0, 2000) || null;
  if ('has_box' in b) v.has_box = b.has_box ? 1 : 0;
  if ('acquired_year' in b) v.acquired_year = toInt(b.acquired_year);
  if ('cost' in b) { v.cost_minor = toMinor(b.cost); v.cost_currency = cur(b.cost_currency); }
  if (!bottleId) {
    if (!await env.DB.prepare('SELECT 1 FROM editions WHERE id = ?').bind(editionId).first()) return json({ error: 'not found' }, 404);
    const id = uid();
    const cols = ['id', 'edition_id', 'created_at', ...Object.keys(v)];
    await env.DB.prepare(`INSERT INTO bottles (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(id, editionId, nowIso(), ...Object.values(v)).run();
    return json({ ok: true, id });
  }
  if (Object.keys(v).length) {
    await env.DB.prepare(`UPDATE bottles SET ${Object.keys(v).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(v), bottleId).run();
  }
  return json({ ok: true, id: bottleId });
}

async function insertPrice(env, editionId, v, isDemo = 0) {
  await env.DB.prepare(
    `INSERT INTO prices (id, edition_id, bottle_id, price_type, amount_minor, currency, market, venue, lot_number, observed_at,
      condition_note, source_url, volume_ml, is_public, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uid(), editionId, v.bottle_id || null, v.price_type, v.amount_minor, v.currency, v.market, v.venue, v.lot_number, v.observed_at,
    v.condition_note, v.source_url, v.volume_ml, v.is_public, isDemo, nowIso()).run();
}

// CSV import: preview (dry run) marks bad rows; commit inserts only good rows, then rescores touched editions.
async function importPrices(env, b) {
  const rows = parseCsv(String(b.csv || '').slice(0, 2_000_000));
  if (!rows.length) return json({ error: '冇內容' }, 400);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ['edition_slug', 'price_type', 'currency', 'observed_at'].filter((c) => !header.includes(c));
  if (missing.length) return json({ error: `欠欄位：${missing.join(', ')}`, columns: CSV_COLUMNS }, 400);
  const { results: eds } = await env.DB.prepare('SELECT id, slug FROM editions').all();
  const bySlug = new Map(eds.map((e) => [e.slug, e.id]));
  const out = rows.slice(1, 2001).map((cells, i) => {
    const obj = Object.fromEntries(header.map((h, k) => [h, cells[k] ?? '']));
    const { value, errors } = validatePrice(obj);
    const editionId = bySlug.get(String(obj.edition_slug).trim());
    if (!editionId) errors.push('edition_slug');
    return { line: i + 2, input: obj, value, editionId, errors };
  });
  const good = out.filter((r) => !r.errors.length);
  if (b.commit) {
    for (const r of good) await insertPrice(env, r.editionId, r.value);
    const settings = await getSettings(env);
    for (const id of new Set(good.map((r) => r.editionId))) await rescoreEdition(env, id, settings);
  }
  return json({ committed: !!b.commit, ok: good.length, bad: out.length - good.length, rows: out.map(({ line, input, errors }) => ({ line, input, errors })) });
}

async function uploadMedia(env, editionId, request) {
  if (!env.MEDIA) return json({ error: 'R2 未設定' }, 500);
  if (!await env.DB.prepare('SELECT 1 FROM editions WHERE id = ?').bind(editionId).first()) return json({ error: 'not found' }, 404);
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: '冇檔案' }, 400);
  if (!MEDIA_TYPES.includes(file.type)) return json({ error: '只接受 JPG、PNG、WebP 或 PDF' }, 400);
  if (file.size > MAX_UPLOAD) return json({ error: '檔案不可大過 10MB' }, 400);
  const kind = ['photo', 'certificate', 'receipt'].includes(form.get('kind')) ? form.get('kind') : 'photo';
  const id = uid();
  const key = `editions/${editionId}/${id}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  const bottleId = String(form.get('bottle_id') || '') || null;
  await env.DB.prepare('INSERT INTO media (id, edition_id, bottle_id, r2_key, kind, is_public, caption, content_type) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .bind(id, editionId, bottleId, key, kind, String(form.get('caption') || '').slice(0, 200) || null, file.type).run();
  return json({ ok: true, id });
}

async function getMedia(env, id) {
  const m = await env.DB.prepare('SELECT r2_key, content_type FROM media WHERE id = ?').bind(id).first();
  if (!m || !env.MEDIA) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(m.r2_key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': m.content_type || 'application/octet-stream', 'cache-control': 'private, no-store' } });
}

// §5 settings page values used in phase 2.
async function saveSettings(env, b) {
  const stmts = [];
  if (['HKD', 'USD'].includes(b.default_currency)) stmts.push(['default_currency', b.default_currency]);
  const pct = Number(b.exit_cost_pct);
  if (Number.isFinite(pct) && pct >= 0 && pct <= 60) stmts.push(['exit_cost_pct', String(pct)]);
  if (b.score_weights && typeof b.score_weights === 'object') {
    const w = {};
    for (const k of ['trend', 'activity', 'scarcity', 'exit', 'fundamentals']) w[k] = Math.max(0, Number(b.score_weights[k]) || 0);
    if (Object.values(w).reduce((a, c) => a + c, 0) === 100) stmts.push(['score_weights', JSON.stringify(w)]);
    else return json({ error: '五項權重加埋要等於 100' }, 400);
  }
  if (stmts.length) {
    await env.DB.batch(stmts.map(([k, v]) => env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v)));
    const settings = await getSettings(env);
    const { results } = await env.DB.prepare('SELECT id FROM editions').all();
    for (const e of results) await rescoreEdition(env, e.id, settings);
  }
  return json({ ok: true });
}

export async function editionsRoute(request, env, p, url) {
  const m = request.method;
  if (p[0] === 'editions' && !p[1] && m === 'GET') return listEditions(env, url);
  if (p[0] === 'editions' && !p[1] && m === 'POST') return saveEdition(env, null, await body(request));
  if (p[0] === 'editions' && p[1] && !p[2] && m === 'GET') return getEdition(env, p[1]);
  if (p[0] === 'editions' && p[1] && !p[2] && m === 'PATCH') return saveEdition(env, p[1], await body(request));
  if (p[0] === 'editions' && p[1] && !p[2] && m === 'DELETE') return deleteEdition(env, p[1]);
  if (p[0] === 'editions' && p[2] === 'rescore' && m === 'POST') { await rescoreEdition(env, p[1]); return json({ ok: true }); }
  if (p[0] === 'editions' && p[2] === 'bottles' && m === 'POST') return saveBottle(env, p[1], null, await body(request));
  if (p[0] === 'editions' && p[2] === 'media' && m === 'POST') return uploadMedia(env, p[1], request);
  if (p[0] === 'editions' && p[2] === 'prices' && m === 'POST') {
    const { value, errors } = validatePrice(await body(request));
    if (errors.length) return json({ error: `資料有誤：${errors.join(', ')}` }, 400);
    if (!await env.DB.prepare('SELECT 1 FROM editions WHERE id = ?').bind(p[1]).first()) return json({ error: 'not found' }, 404);
    await insertPrice(env, p[1], value);
    await rescoreEdition(env, p[1]);
    return json({ ok: true });
  }
  if (p[0] === 'bottles' && p[1] && m === 'PATCH') {
    const ed = await env.DB.prepare('SELECT edition_id FROM bottles WHERE id = ?').bind(p[1]).first('edition_id');
    if (!ed) return json({ error: 'not found' }, 404);
    return saveBottle(env, ed, p[1], await body(request));
  }
  if (p[0] === 'bottles' && p[1] && m === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('UPDATE prices SET bottle_id = NULL WHERE bottle_id = ?').bind(p[1]),
      env.DB.prepare('UPDATE media SET bottle_id = NULL WHERE bottle_id = ?').bind(p[1]),
      env.DB.prepare('DELETE FROM bottles WHERE id = ?').bind(p[1]),
    ]);
    return json({ ok: true });
  }
  if (p[0] === 'prices' && p[1] === 'import' && m === 'POST') return importPrices(env, await body(request));
  if (p[0] === 'prices' && p[1] && m === 'PATCH') {
    const b = await body(request);
    await env.DB.prepare('UPDATE prices SET is_public = ? WHERE id = ?').bind(b.is_public ? 1 : 0, p[1]).run();
    return json({ ok: true });
  }
  if (p[0] === 'prices' && p[1] && m === 'DELETE') {
    const ed = await env.DB.prepare('SELECT edition_id FROM prices WHERE id = ?').bind(p[1]).first('edition_id');
    await env.DB.prepare('DELETE FROM prices WHERE id = ?').bind(p[1]).run();
    if (ed) await rescoreEdition(env, ed);
    return json({ ok: true });
  }
  if (p[0] === 'media' && p[1] && m === 'GET') return getMedia(env, p[1]);
  if (p[0] === 'media' && p[1] && m === 'PATCH') {
    const b = await body(request);
    await env.DB.prepare('UPDATE media SET is_public = ? WHERE id = ?').bind(b.is_public ? 1 : 0, p[1]).run();
    return json({ ok: true });
  }
  if (p[0] === 'media' && p[1] && m === 'DELETE') {
    const key = await env.DB.prepare('SELECT r2_key FROM media WHERE id = ?').bind(p[1]).first('r2_key');
    if (key) await env.MEDIA?.delete(key);
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(p[1]).run();
    return json({ ok: true });
  }
  if (p[0] === 'demo' && m === 'POST') return json({ ok: true, editions: await seedDemo(env) });
  if (p[0] === 'demo' && m === 'DELETE') { await clearDemo(env); return json({ ok: true }); }
  if (p[0] === 'ai-draft' && m === 'POST') { const r = await aiDraft(env, (await body(request)).text); return json(r, r.error ? 400 : 200); }
  if (p[0] === 'entities-all' && m === 'GET') {
    const { results } = await env.DB.prepare("SELECT id, type, name_en, name_zh FROM entities WHERE type IN ('distillery','brand','bottler') ORDER BY name_en").all();
    return json(results);
  }
  if (p[0] === 'settings' && m === 'GET') return json(await getSettings(env));
  if (p[0] === 'settings' && m === 'PATCH') return saveSettings(env, await body(request));
  return null;
}
