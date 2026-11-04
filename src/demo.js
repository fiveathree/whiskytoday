// Demo mode (PLAN §12.1): ~10 clearly fictional editions with price history, all named "示範 / Demo",
// with fictional distilleries and venues so nothing can pass for a real auction result.
import { uid, nowIso, getSettings } from './db.js';
import { rescoreEdition } from './rescore.js';

const DISTILLERIES = [
  { id: 'demo-glenmora', name_en: 'Demo Glenmora (fictional)', name_zh: '示範酒廠・格蘭摩拉', status: 'closed' },
  { id: 'demo-kinloch', name_en: 'Demo Kinloch (fictional)', name_zh: '示範酒廠・堅洛', status: 'active' },
  { id: 'demo-hanamura', name_en: 'Demo Hanamura (fictional)', name_zh: '示範酒廠・花村', status: 'mothballed' },
];
const VENUES = ['示範拍賣行甲 Demo House A', '示範拍賣行乙 Demo House B', '示範拍賣行丙 Demo House C'];

// [name, distillery, category, age, vintage, bottling, size, start HKD, yearly growth, sales per year]
const EDITIONS = [
  ['Glenmora 40yo 1982', 'demo-glenmora', 'closed_distillery', 40, 1982, 2022, 120, 90000, 0.14, 4],
  ['Glenmora 25yo Single Cask', 'demo-glenmora', 'closed_distillery', 25, 1997, 2022, 240, 32000, 0.09, 3],
  ['Kinloch 30yo Sherry Cask', 'demo-kinloch', 'single_cask', 30, 1993, 2023, 450, 26000, 0.05, 3],
  ['Kinloch 18yo Limited', 'demo-kinloch', 'scotland', 18, 2004, 2022, 3000, 4200, -0.02, 5],
  ['Kinloch 21yo Port Finish', 'demo-kinloch', 'scotland', 21, 2001, 2022, 1500, 7800, 0.03, 2],
  ['Hanamura 30yo', 'demo-hanamura', 'japanese', 30, 1992, 2022, 300, 110000, 0.18, 3],
  ['Hanamura 17yo', 'demo-hanamura', 'japanese', 17, 2005, 2022, 2000, 16000, 0.07, 4],
  ['Hanamura Cask Strength 2008', 'demo-hanamura', 'japanese', 15, 2008, 2023, 800, 12000, 0.11, 3],
  ['Kinloch 12yo Batch 3', 'demo-kinloch', 'scotland', 12, 2011, 2023, null, 1900, 0.01, 1],
  ['Glenmora 35yo Rare Release', 'demo-glenmora', 'closed_distillery', 35, 1988, 2023, 90, 150000, 0.12, 2],
];

// Deterministic pseudo-random so the demo looks the same each time.
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }

export async function seedDemo(env) {
  await clearDemo(env);
  const now = new Date();
  const ts = nowIso();
  const stmts = DISTILLERIES.map((d) => env.DB.prepare(
    "INSERT OR REPLACE INTO entities (id, type, name_en, name_zh, aliases, region, status) VALUES (?, 'distillery', ?, ?, '[]', 'other', ?)",
  ).bind(d.id, d.name_en, d.name_zh, d.status));
  const ids = [];
  EDITIONS.forEach(([name, dist, cat, age, vint, bott, size, start, growth, perYear], i) => {
    const id = uid();
    ids.push(id);
    const target = Math.round(start * (1 + growth) ** 4 * 1.1);
    stmts.push(env.DB.prepare(
      `INSERT INTO editions (id, slug, distillery_id, name_en, name_zh, category, vintage_year, bottling_year, age_years, edition_size,
        abv, volume_ml, description_zh, description_en, owner_comment_zh, target_price_minor, target_currency, floor_price_minor, floor_currency,
        holding_months, is_tracked, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 48.5, 700, ?, ?, ?, ?, 'HKD', ?, 'HKD', 36, 1, 1, ?, ?)`,
    ).bind(id, `demo-${i + 1}`, dist, `[Demo] ${name}`, `【示範】${name}`, cat, vint, bott, age, size,
      '示範資料：虛構酒款，只用嚟展示評分表、酒款頁同分享頁效果。', 'Demo data: a fictional bottling used only to show how the pages work.',
      '示範評語。', target * 100, Math.round(start * 0.95) * 100, ts, ts));
    const r = rng(i + 7);
    // Three years of sales, a few unsold lots, and one dealer ask.
    for (let m = 36; m >= 0; m -= 12 / perYear) {
      const when = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - Math.round(m), 5 + Math.floor(r() * 20)));
      if (when > now) continue;
      const yearsFromStart = (36 - m) / 12;
      const price = Math.round(start * (1 + growth) ** yearsFromStart * (0.9 + r() * 0.2));
      const unsold = r() < 0.12;
      stmts.push(env.DB.prepare(
        `INSERT INTO prices (id, edition_id, price_type, amount_minor, currency, market, venue, observed_at, volume_ml, is_public, is_demo, created_at)
         VALUES (?, ?, ?, ?, 'HKD', 'HK', ?, ?, 700, 1, 1, ?)`,
      ).bind(uid(), id, unsold ? 'auction_unsold' : 'auction_total', unsold ? null : price * 100, VENUES[Math.floor(r() * VENUES.length)], when.toISOString(), ts));
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO prices (id, edition_id, price_type, amount_minor, currency, market, venue, observed_at, volume_ml, is_public, is_demo, created_at)
       VALUES (?, ?, 'dealer_ask', ?, 'HKD', 'HK', '示範酒商 Demo Dealer', ?, 700, 0, 1, ?)`,
    ).bind(uid(), id, Math.round(start * (1 + growth) ** 3 * 1.15) * 100, now.toISOString(), ts));
  });
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  const settings = await getSettings(env);
  for (const id of ids) await rescoreEdition(env, id, settings);
  return ids.length;
}

export async function clearDemo(env) {
  const sub = 'SELECT id FROM editions WHERE is_demo = 1';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM scores WHERE edition_id IN (${sub})`),
    env.DB.prepare(`DELETE FROM prices WHERE edition_id IN (${sub}) OR is_demo = 1`),
    env.DB.prepare(`DELETE FROM bottles WHERE edition_id IN (${sub})`),
    env.DB.prepare(`DELETE FROM media WHERE edition_id IN (${sub})`),
    env.DB.prepare('DELETE FROM editions WHERE is_demo = 1'),
    env.DB.prepare("DELETE FROM entities WHERE id LIKE 'demo-%'"),
  ]);
}
