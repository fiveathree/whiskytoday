// JSON API. /api/news* is public (owner decision 2026-11-04); /api/admin/* needs an Access admin,
// checked in worker.js and again here, not just hidden in the UI (PLAN §8.1).
import { json, uid, nowIso } from './db.js';
import { runCollection, manualFeeds, manualProcess } from './news.js';
import { sendDigest } from './digest.js';
import { CATEGORIES } from './rules.js';
import { editionsRoute } from './editions.js';
import { listCatalog, getCatalogItem, getPublicMedia } from './catalog.js';

const PAGE_SIZE = 10;
const REGIONS = ['scotland', 'japan', 'usa', 'taiwan', 'hk_china', 'ireland', 'other'];

// Columns safe for the public (no AI cost / model details).
const LIST_COLS = `a.id, a.cluster_id, a.published_at, a.fetched_at, a.category, a.importance, a.investor_focus,
  a.title_zh, a.title_en, a.summary_zh, a.summary_en, a.investor_card_json, s.region, s.name AS source_name`;

export async function handleApi(request, env, ctx, user, url) {
  try {
    // await here so errors from async handlers land in this catch, not as a bare 500.
    return await route(request, env, ctx, user, url);
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e);
    // D1 free tier: 100,000 row writes per day, reset at 00:00 UTC (08:00 Hong Kong).
    if (/daily row write limit/i.test(msg)) {
      return json({ error: '資料庫今日嘅免費寫入額度已經用完，香港時間明早 08:00 自動重設，之後再試。' }, 503);
    }
    return json({ error: 'server error' }, 500);
  }
}

async function route(request, env, ctx, user, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const method = request.method;
  {
    if (parts[0] === 'news' && method === 'GET' && !parts[1]) return listNews(env, url);
    if (parts[0] === 'news' && method === 'GET' && parts[1]) return getNews(env, parts[1]);
    if (parts[0] === 'trends' && method === 'GET') return getTrends(env);
    if (parts[0] === 'whisky' && method === 'GET' && !parts[1]) return listCatalog(env, url);
    if (parts[0] === 'whisky' && method === 'GET' && parts[1]) return getCatalogItem(env, decodeURIComponent(parts[1]));
    if (parts[0] === 'whisky-media' && method === 'GET' && parts[1]) return getPublicMedia(env, parts[1]);

    if (parts[0] === 'admin') {
      if (user?.role !== 'admin') return json({ error: 'forbidden' }, 403);
      return adminRoute(request, env, ctx, parts.slice(1), url, user);
    }
    return json({ error: 'not found' }, 404);
  }
}

// Market trends for the public trends page: HMRC export statistics plus our own news data.
const ASIA = ['HK', 'TW', 'CN', 'SG', 'JP', 'KR'];

async function getTrends(env) {
  const latest = await env.DB.prepare("SELECT MAX(month) AS m FROM trade_exports WHERE segment = 'all_scotch'").first('m');
  // Last 12 complete months vs the 12 before (by month number).
  const ym = (m, back) => { const y = Math.floor(m / 100); const mo = m % 100 - 1 - back; const d = new Date(Date.UTC(y, mo, 1)); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
  const from12 = latest ? ym(latest, 11) : 0;
  const from24 = latest ? ym(latest, 23) : 0;
  const since180 = new Date(Date.now() - 180 * 86400_000).toISOString();
  const since365 = new Date(Date.now() - 365 * 86400_000).toISOString();

  const [monthly, asia, markets, newsMonthly, sentiment, entities] = await Promise.all([
    env.DB.prepare(`SELECT month, segment, SUM(value_gbp) AS value, SUM(lpa) AS lpa FROM trade_exports
      GROUP BY month, segment ORDER BY month`).all(),
    env.DB.prepare(`SELECT month, country_alpha AS c, value_gbp AS value FROM trade_exports
      WHERE segment = 'all_scotch' AND country_alpha IN (${ASIA.map(() => '?').join(',')}) ORDER BY month`).bind(...ASIA).all(),
    env.DB.prepare(`SELECT country_alpha AS c, MAX(country_name) AS name,
        SUM(CASE WHEN month >= ? THEN value_gbp ELSE 0 END) AS last12,
        SUM(CASE WHEN month < ? THEN value_gbp ELSE 0 END) AS prev12
      FROM trade_exports WHERE segment = 'all_scotch' AND month >= ? AND country_alpha IS NOT NULL
      GROUP BY country_alpha ORDER BY last12 DESC LIMIT 12`).bind(from12, from12, from24).all(),
    env.DB.prepare(`SELECT substr(COALESCE(published_at, fetched_at), 1, 7) AS ym, category, COUNT(*) AS n
      FROM articles WHERE status = 'published' AND COALESCE(published_at, fetched_at) >= ?
      GROUP BY ym, category ORDER BY ym`).bind(since365).all(),
    env.DB.prepare(`SELECT substr(COALESCE(published_at, fetched_at), 1, 7) AS ym,
        json_extract(investor_card_json, '$.direction') AS dir, COUNT(*) AS n
      FROM articles WHERE status = 'published' AND investor_focus = 1 AND COALESCE(published_at, fetched_at) >= ?
      GROUP BY ym, dir ORDER BY ym`).bind(since365).all(),
    env.DB.prepare(`SELECT e.name_en, e.name_zh, e.type, COUNT(*) AS n, SUM(COALESCE(ae.direction, 0)) AS net
      FROM article_entities ae JOIN entities e ON e.id = ae.entity_id JOIN articles a ON a.id = ae.article_id
      WHERE a.status = 'published' AND a.investor_focus = 1 AND COALESCE(a.published_at, a.fetched_at) >= ?
      GROUP BY e.id ORDER BY n DESC, net DESC LIMIT 10`).bind(since180).all(),
  ]);
  const res = json({
    latestMonth: latest,
    exports: { monthly: monthly.results, asia: asia.results, markets: markets.results },
    news: { monthly: newsMonthly.results, sentiment: sentiment.results, entities: entities.results },
    source: 'HMRC Overseas Trade Statistics (uktradeinfo.com), Open Government Licence v3.0',
  });
  res.headers.set('cache-control', 'public, max-age=900');
  return res;
}

function buildFilters(url) {
  const where = ["a.status = 'published'"];
  const binds = [];
  const view = url.searchParams.get('view');
  if (view === 'investor') where.push('a.investor_focus = 1');
  const region = url.searchParams.get('region');
  if (REGIONS.includes(region)) { where.push('s.region = ?'); binds.push(region); }
  const cat = url.searchParams.get('category');
  if (CATEGORIES.includes(cat)) { where.push('a.category = ?'); binds.push(cat); }
  const from = url.searchParams.get('from');
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { where.push('COALESCE(a.published_at, a.fetched_at) >= ?'); binds.push(from); }
  const to = url.searchParams.get('to');
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) { where.push('COALESCE(a.published_at, a.fetched_at) < ?'); binds.push(`${to}T23:59:59.999Z`); }
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (q) {
    if ([...q].length >= 3) {
      // FTS5 trigram: quote the phrase so user input is never parsed as query syntax.
      where.push('a.rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)');
      binds.push(`"${q.replace(/"/g, '""')}"`);
    } else {
      where.push('(a.title_zh LIKE ? OR a.title_en LIKE ? OR a.summary_zh LIKE ? OR a.summary_en LIKE ?)');
      const like = `%${q.replace(/[%_]/g, '')}%`;
      binds.push(like, like, like, like);
    }
  }
  return { where: where.join(' AND '), binds };
}

async function listNews(env, url) {
  const { where, binds } = buildFilters(url);
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const base = `FROM articles a JOIN sources s ON s.id = a.source_id WHERE ${where}`;
  const [{ results: items }, total] = await Promise.all([
    env.DB.prepare(
      `SELECT ${LIST_COLS}, (SELECT COUNT(*) FROM articles m WHERE m.cluster_id = a.cluster_id AND m.status IN ('published','merged')) AS source_count
       ${base} ORDER BY COALESCE(a.published_at, a.fetched_at) DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n ${base}`).bind(...binds).first('n'),
  ]);
  return json({ items: items.map(withDirection), total, page, pageSize: PAGE_SIZE });
}

function withDirection(row) {
  let direction = null;
  if (row.investor_card_json) {
    try { direction = JSON.parse(row.investor_card_json).direction || null; } catch { /* ignore */ }
  }
  delete row.investor_card_json;
  return { ...row, direction };
}

async function getNews(env, id) {
  const a = await env.DB.prepare(
    `SELECT ${LIST_COLS}, a.facts_json, a.claims_json, a.ai_view_zh, a.ai_view_en, a.canonical_url, a.original_title, a.status
     FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.id = ?`,
  ).bind(id).first();
  if (!a || a.status !== 'published') return json({ error: 'not found' }, 404);
  const [{ results: sources }, { results: entities }] = await Promise.all([
    env.DB.prepare(`SELECT s.name, m.canonical_url AS url, m.original_title AS title, m.published_at
      FROM articles m JOIN sources s ON s.id = m.source_id WHERE m.cluster_id = ? AND m.status IN ('published','merged')
      ORDER BY m.published_at`).bind(a.cluster_id).all(),
    env.DB.prepare(`SELECT e.id, e.name_en, e.name_zh, e.type, ae.direction FROM article_entities ae
      JOIN entities e ON e.id = ae.entity_id WHERE ae.article_id = ?`).bind(id).all(),
  ]);
  const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  return json({
    ...a,
    facts: parse(a.facts_json) || [],
    claims: parse(a.claims_json) || [],
    investor_card: parse(a.investor_card_json),
    facts_json: undefined, claims_json: undefined, investor_card_json: undefined,
    sources,
    entities,
  });
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function adminRoute(request, env, ctx, p, url, user) {
  const m = request.method;

  if (p[0] === 'me' && m === 'GET') return json(user);
  const ed = await editionsRoute(request, env, p, url);
  if (ed) return ed;

  if (p[0] === 'sources' && m === 'GET') {
    const { results } = await env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM articles a WHERE a.source_id = s.id) AS article_count
      FROM sources s ORDER BY s.is_active DESC, s.name`).all();
    return json(results);
  }
  if (p[0] === 'sources' && m === 'POST') {
    const b = await readBody(request);
    let feed;
    try { feed = new URL(b.feed_url); } catch { return json({ error: 'feed_url 無效' }, 400); }
    if (feed.protocol !== 'https:' && feed.protocol !== 'http:') return json({ error: 'feed_url 無效' }, 400);
    if (!b.name || !REGIONS.includes(b.region)) return json({ error: '名稱或地區無效' }, 400);
    const id = String(b.id || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
    await env.DB.prepare(`INSERT INTO sources (id, name, home_url, feed_url, region, language, kind, filter_keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, String(b.name).slice(0, 100), b.home_url || feed.origin, feed.toString(),
      b.region, b.language || 'en', ['news', 'auction', 'blog', 'official'].includes(b.kind) ? b.kind : 'news',
      b.filter_keywords || null).run();
    return json({ ok: true, id });
  }
  if (p[0] === 'sources' && p[1] && m === 'PATCH') {
    const b = await readBody(request);
    if ('is_active' in b) await env.DB.prepare('UPDATE sources SET is_active = ? WHERE id = ?').bind(b.is_active ? 1 : 0, p[1]).run();
    if ('filter_keywords' in b) await env.DB.prepare('UPDATE sources SET filter_keywords = ? WHERE id = ?').bind(b.filter_keywords || null, p[1]).run();
    return json({ ok: true });
  }

  if (p[0] === 'jobs' && m === 'GET') {
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
    const [{ results }, month, failed] = await Promise.all([
      env.DB.prepare('SELECT * FROM job_logs ORDER BY started_at DESC LIMIT 12').all(),
      env.DB.prepare('SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM job_logs WHERE started_at >= ?').bind(monthStart).first('c'),
      env.DB.prepare(`SELECT id, original_title, canonical_url, ai_view_en AS error, fetched_at FROM articles
        WHERE status = 'failed' ORDER BY fetched_at DESC LIMIT 10`).all(),
    ]);
    return json({ jobs: results, monthCostCents: month, failed: failed.results });
  }
  // Run inside the request (no waitUntil): waitUntil is cut off ~30s after the response,
  // while a request may run as long as the browser stays connected.
  // Manual collection in short steps (see news.js): feeds first, then AI in small batches.
  if (p[0] === 'run' && p[1] === 'feeds' && m === 'POST') return json(await manualFeeds(env));
  if (p[0] === 'run' && p[1] === 'process' && m === 'POST') return json(await manualProcess(env, 8));
  if (p[0] === 'run' && m === 'POST') {
    await runCollection(env);
    return json({ ok: true, finished: nowIso() });
  }
  if (p[0] === 'digest' && m === 'POST') {
    await sendDigest(env);
    return json({ ok: true });
  }
  if (p[0] === 'retry-failed' && m === 'POST') {
    await env.DB.prepare("UPDATE articles SET status = 'pending', ai_view_en = NULL WHERE status = 'failed'").run();
    return json({ ok: true });
  }

  if (p[0] === 'articles' && p[1] && m === 'PATCH') {
    const b = await readBody(request);
    if (!['published', 'hidden'].includes(b.status)) return json({ error: 'status 無效' }, 400);
    await env.DB.prepare('UPDATE articles SET status = ? WHERE id = ?').bind(b.status, p[1]).run();
    return json({ ok: true });
  }

  if (p[0] === 'entities' && m === 'GET') {
    const q = `%${(url.searchParams.get('q') || '').replace(/[%_]/g, '').slice(0, 50)}%`;
    const tracked = url.searchParams.get('tracked') === '1';
    const { results } = await env.DB.prepare(`SELECT id, type, name_en, name_zh, region, status, is_tracked FROM entities
      WHERE (name_en LIKE ? OR name_zh LIKE ? OR aliases LIKE ?) ${tracked ? 'AND is_tracked = 1' : ''}
      ORDER BY is_tracked DESC, name_en LIMIT 40`).bind(q, q, q).all();
    return json(results);
  }
  if (p[0] === 'entities' && m === 'POST') {
    const b = await readBody(request);
    const types = ['distillery', 'brand', 'company', 'bottler', 'auction_house'];
    if (!b.name_en || !types.includes(b.type)) return json({ error: '名稱或類型無效' }, 400);
    const id = String(b.name_en).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
    await env.DB.prepare(`INSERT INTO entities (id, type, name_en, name_zh, aliases, region, status) VALUES (?, ?, ?, ?, '[]', ?, ?)`)
      .bind(id, b.type, String(b.name_en).slice(0, 120), b.name_zh || null, REGIONS.includes(b.region) ? b.region : 'other',
        b.type === 'distillery' ? (b.status || 'active') : null).run();
    await env.DB.prepare('UPDATE unmatched_entities SET dismissed = 1 WHERE name = ?').bind(b.name_en).run();
    return json({ ok: true, id });
  }
  if (p[0] === 'entities' && p[1] && m === 'PATCH') {
    const b = await readBody(request);
    if ('is_tracked' in b) await env.DB.prepare('UPDATE entities SET is_tracked = ? WHERE id = ?').bind(b.is_tracked ? 1 : 0, p[1]).run();
    if (['active', 'closed', 'mothballed', 'reopened'].includes(b.status)) {
      await env.DB.prepare('UPDATE entities SET status = ? WHERE id = ?').bind(b.status, p[1]).run();
    }
    return json({ ok: true });
  }
  if (p[0] === 'unmatched' && m === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM unmatched_entities WHERE dismissed = 0
      ORDER BY seen_count DESC, last_seen_at DESC LIMIT 30`).all();
    return json(results);
  }
  if (p[0] === 'unmatched' && m === 'DELETE') {
    const name = url.searchParams.get('name') || '';
    await env.DB.prepare('UPDATE unmatched_entities SET dismissed = 1 WHERE name = ?').bind(name).run();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
