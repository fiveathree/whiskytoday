// Recompute and store an edition's score (PLAN §6.5). Every run writes a scores row with its inputs.
import { scoreEdition, makeConverter, ALGO_VERSION } from './score.js';
import { getSettings, uid, nowIso } from './db.js';

export async function loadConverter(env, currencies) {
  const curs = [...new Set(currencies.filter((c) => c && c !== 'HKD'))];
  if (!curs.length) return makeConverter([]);
  const { results } = await env.DB.prepare(
    `SELECT rate_date, base, quote, rate FROM fx_rates WHERE quote = 'HKD' AND base IN (${curs.map(() => '?').join(',')})`,
  ).bind(...curs).all();
  return makeConverter(results);
}

function scoreSettings(s) {
  const parse = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
  return {
    exitCostPct: Number(s.exit_cost_pct ?? 15),
    weights: parse(s.score_weights, undefined),
    tierCutoffs: parse(s.tier_cutoffs, undefined),
  };
}

export async function rescoreEdition(env, editionId, settingsRow) {
  const edition = await env.DB.prepare('SELECT * FROM editions WHERE id = ?').bind(editionId).first();
  if (!edition) return null;
  const settings = scoreSettings(settingsRow || await getSettings(env));
  const [{ results: prices }, distillery, sameName, { results: news }] = await Promise.all([
    env.DB.prepare('SELECT * FROM prices WHERE edition_id = ?').bind(editionId).all(),
    edition.distillery_id ? env.DB.prepare('SELECT status FROM entities WHERE id = ?').bind(edition.distillery_id).first() : null,
    env.DB.prepare('SELECT COUNT(*) AS n FROM editions WHERE lower(name_en) = lower(?)').bind(edition.name_en).first('n'),
    env.DB.prepare(
      `SELECT a.id, ae.direction, a.importance, COALESCE(a.published_at, a.fetched_at) AS published_at
       FROM article_entities ae JOIN articles a ON a.id = ae.article_id
       WHERE a.status = 'published' AND a.investor_focus = 1 AND ae.entity_id IN (?, ?) AND ae.direction IS NOT NULL`,
    ).bind(edition.distillery_id || '', edition.brand_id || '').all(),
  ]);
  const convert = await loadConverter(env, [...prices.map((p) => p.currency), edition.target_currency, edition.floor_currency]);
  const r = scoreEdition({
    edition, distilleryStatus: distillery?.status || null, prices, news, sameNameCount: sameName || 1, convert, settings, now: new Date(),
  });
  const p = r.parts || {};
  await env.DB.prepare(
    `INSERT INTO scores (id, edition_id, computed_at, status, total, tier, trend, activity, scarcity, exit, fundamentals, inputs_json, algo_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uid(), editionId, nowIso(), r.status, r.total, r.tier, p.trend ?? null, p.activity ?? null, p.scarcity ?? null,
    p.exit ?? null, p.fundamentals ?? null, JSON.stringify({ ...r.inputs, card: r.card }), ALGO_VERSION).run();
  return r;
}

// Investor-focus news linked to these entities -> rescore editions of those distilleries / brands.
export async function rescoreForEntities(env, entityIds) {
  if (!entityIds.length) return 0;
  const marks = entityIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id FROM editions WHERE distillery_id IN (${marks}) OR brand_id IN (${marks})`,
  ).bind(...entityIds, ...entityIds).all();
  const settings = await getSettings(env);
  for (const e of results) await rescoreEdition(env, e.id, settings);
  return results.length;
}
