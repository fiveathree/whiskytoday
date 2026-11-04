// Edition scoring (PLAN.md §6). Pure functions: same inputs -> same output, no I/O.
// Every amount is converted to HKD minor units through the `convert` function the caller supplies.

export const ALGO_VERSION = 'score-v1';

const DEFAULT_MAX = { trend: 30, activity: 20, scarcity: 25, exit: 15, fundamentals: 10 };
const SOLD = new Set(['auction_total', 'private_sale']);
const DAY = 86400_000;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const monthsBefore = (now, months) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate())).getTime();

/**
 * @param {object} p
 * @param {object} p.edition        edition row
 * @param {string|null} p.distilleryStatus  active / closed / mothballed / reopened
 * @param {Array}  p.prices         price rows
 * @param {Array}  p.news           [{ direction (-1|0|1), importance (1-5), published_at }]
 * @param {number} p.sameNameCount  editions sharing this edition's name (incl. itself)
 * @param {function} p.convert      (amountMinor, currency, isoDate) -> HKD minor | null
 * @param {object} p.settings       { exitCostPct, weights, tierCutoffs }
 * @param {Date}   p.now
 */
export function scoreEdition({ edition, distilleryStatus, prices, news, sameNameCount = 1, convert, settings = {}, now = new Date() }) {
  const weights = { ...DEFAULT_MAX, ...(settings.weights || {}) };
  const cut = { A: 75, B: 60, C: 45, ...(settings.tierCutoffs || {}) };
  const exitCostPct = settings.exitCostPct ?? 15;
  const t = now.getTime();
  const m12 = monthsBefore(now, 12);
  const m24 = monthsBefore(now, 24);
  const m36 = monthsBefore(now, 36);

  // Sold prices in HKD (dealer asks and MSRP are reference only, §6.1).
  const sales = [];
  let unsold12 = 0;
  for (const p of prices) {
    const when = Date.parse(p.observed_at);
    if (p.price_type === 'auction_unsold' && when >= m12) unsold12++;
    if (!SOLD.has(p.price_type) || p.amount_minor == null) continue;
    const hkd = convert(p.amount_minor, p.currency, p.observed_at);
    if (hkd == null) continue;
    sales.push({ id: p.id, hkd, when, venue: p.venue || null });
  }
  const in24 = sales.filter((s) => s.when >= m24);
  const inputs = { prices: sales.map((s) => ({ id: s.id, hkd: s.hkd })), exitCostPct, weights, now: now.toISOString() };

  // Pre-conditions (§6.1)
  if (in24.length < 3) return { status: 'insufficient_data', total: null, tier: null, parts: null, inputs, card: null };
  const volumeMismatch = edition.volume_ml && prices.some((p) => p.volume_ml && p.volume_ml !== edition.volume_ml);
  if ((!edition.bottling_year && sameNameCount > 1) || volumeMismatch) {
    return { status: 'needs_review', total: null, tier: null, parts: null, inputs: { ...inputs, volumeMismatch, sameNameCount }, card: null };
  }

  // 1. Price trend
  const med = (from, to) => median(sales.filter((s) => s.when >= from && s.when < to).map((s) => s.hkd));
  const recent = med(m12, t + 1);
  const prior = med(m24, m12);
  const old = med(m36, m24);
  const t12 = recent != null && prior ? recent / prior - 1 : null;
  const t36 = recent != null && old ? Math.sqrt(recent / old) - 1 : null; // two years apart -> annualised
  const tr = t12 != null && t36 != null ? 0.5 * t12 + 0.5 * t36 : (t12 ?? t36);
  // No comparable period (e.g. all sales in the last 12 months): treat as flat and record it.
  const tUsed = tr ?? 0;
  const trend = clamp((tUsed + 0.10) / 0.40, 0, 1) * DEFAULT_MAX.trend;

  // 2. Activity
  const sold12 = sales.filter((s) => s.when >= m12).length;
  const unsoldPart = sold12 + unsold12 > 0 && unsold12 > 0 ? (1 - unsold12 / (sold12 + unsold12)) * 5 : 3;
  const activity = (Math.min(sold12, 10) / 10) * 15 + unsoldPart;

  // 3. Scarcity
  const size = edition.edition_size;
  let scarcity = size == null ? 0 : size <= 100 ? 12 : size <= 500 ? 9 : size <= 2000 ? 6 : size <= 10000 ? 3 : 0;
  if (distilleryStatus === 'closed' || distilleryStatus === 'mothballed') scarcity += 8;
  const age = edition.age_years;
  if (age != null) scarcity += age >= 40 ? 5 : age >= 25 ? 3 : age >= 18 ? 1 : 0;
  scarcity = Math.min(scarcity, DEFAULT_MAX.scarcity);

  // 4. Exit difficulty
  const venues = new Set(in24.map((s) => s.venue).filter(Boolean)).size;
  const venuePts = venues >= 3 ? 6 : venues === 2 ? 4 : venues === 1 ? 2 : 0;
  const costPts = exitCostPct <= 15 ? 9 : exitCostPct <= 25 ? 6 : exitCostPct <= 35 ? 3 : 0;
  const exit = venuePts + costPts;

  // 5. Distillery fundamentals: start at 5, add decayed investor-focus news
  let fundamentals = 5;
  const newsUsed = [];
  for (const n of news) {
    const days = (t - Date.parse(n.published_at)) / DAY;
    if (days < 0 || days > 180 || !n.direction) continue;
    const delta = n.direction * (n.importance / 5) * (1 - days / 180);
    fundamentals += delta;
    newsUsed.push({ id: n.id, delta: Math.round(delta * 100) / 100 });
  }
  fundamentals = clamp(fundamentals, 0, DEFAULT_MAX.fundamentals);

  // Re-weight if the admin changed the weights in settings (formulas are defined on the default maxima).
  const raw = { trend, activity, scarcity, exit, fundamentals };
  const parts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (v / DEFAULT_MAX[k]) * weights[k]]));
  const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  const tier = total >= cut.A ? 'A' : total >= cut.B ? 'B' : total >= cut.C ? 'C' : 'low';

  const card = investorCard({ edition, recentSales: sales.filter((s) => s.when >= m12), exitCostPct, convert, now });
  return {
    status: 'scored',
    total,
    tier,
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)])),
    inputs: { ...inputs, t12, t36, tUsed, recent, prior, old, sold12, unsold12, venues, news: newsUsed },
    card,
  };
}

// Investment card (§6.4). Admin inputs only for target / floor; AI never generates them.
export function investorCard({ edition, recentSales, exitCostPct, convert, now = new Date() }) {
  const buy = median(recentSales.map((s) => s.hkd));
  const day = now.toISOString().slice(0, 10);
  const target = edition.target_price_minor != null ? convert(edition.target_price_minor, edition.target_currency, day) : null;
  const floor = edition.floor_price_minor != null ? convert(edition.floor_price_minor, edition.floor_currency, day) : null;
  const exitCost = target != null ? target * (exitCostPct / 100) : null;
  let rrr = null;
  if (buy != null && target != null && floor != null) {
    const denom = buy - floor;
    if (denom > 0) rrr = (target - exitCost - buy) / denom;
  }
  return {
    buyRef: buy, sample: recentSales.length, target, floor, exitCost, holdingMonths: edition.holding_months ?? null,
    rrr: rrr == null ? null : Math.round(rrr * 100) / 100,
  };
}

// Build a convert() from fx rows [{ rate_date, base, quote, rate }] where rate = HKD per 1 unit of `base`.
// Uses the rate on or before the date; falls back to the earliest rate after it.
export function makeConverter(fxRows) {
  const byCur = new Map();
  for (const r of fxRows) {
    if (r.quote !== 'HKD') continue;
    if (!byCur.has(r.base)) byCur.set(r.base, []);
    byCur.get(r.base).push(r);
  }
  for (const list of byCur.values()) list.sort((a, b) => a.rate_date.localeCompare(b.rate_date));
  return (minor, currency, isoDate) => {
    if (minor == null || !currency) return null;
    if (currency === 'HKD') return minor;
    const list = byCur.get(currency);
    if (!list?.length) return null;
    const d = String(isoDate).slice(0, 10);
    let pick = list[0];
    for (const r of list) { if (r.rate_date <= d) pick = r; else break; }
    return Math.round(minor * pick.rate);
  };
}
