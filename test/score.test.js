import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreEdition, investorCard, makeConverter, median } from '../src/score.js';

const NOW = new Date('2026-11-01T00:00:00Z');
const hkd = (minor, cur) => (cur === 'HKD' ? minor : null);
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400_000).toISOString();
const sale = (id, hk, d, venue = 'A', type = 'auction_total') =>
  ({ id, price_type: type, amount_minor: hk * 100, currency: 'HKD', observed_at: daysAgo(d), venue });
const base = { edition_size: null, age_years: null, bottling_year: 2020, volume_ml: 700, target_price_minor: null };
const run = (over = {}) => scoreEdition({
  edition: base, distilleryStatus: 'active', prices: [], news: [], convert: hkd, now: NOW, settings: { exitCostPct: 15 }, ...over,
});

test('fewer than 3 sales in 24 months -> insufficient_data, no score', () => {
  const r = run({ prices: [sale('a', 10000, 30), sale('b', 10000, 60), sale('c', 9000, 800)] });
  assert.equal(r.status, 'insufficient_data');
  assert.equal(r.total, null);
  assert.equal(r.tier, null);
});

test('dealer asks do not count as sales', () => {
  const r = run({ prices: [sale('a', 1, 10), sale('b', 1, 20), sale('c', 1, 30, 'A', 'dealer_ask')] });
  assert.equal(r.status, 'insufficient_data');
});

test('only t12 available: +30% a year gives full trend points', () => {
  const r = run({ prices: [sale('a', 13000, 30), sale('b', 13000, 60), sale('c', 10000, 400), sale('d', 10000, 450)] });
  assert.equal(r.status, 'scored');
  assert.ok(Math.abs(r.inputs.t12 - 0.3) < 1e-9);
  assert.equal(r.inputs.t36, null);
  assert.equal(r.parts.trend, 30);
});

test('only t36 available: annualised over two years', () => {
  // recent 12100 vs 25-36 months ago 10000 -> sqrt(1.21) - 1 = 10% a year -> (0.1+0.1)/0.4*30 = 15
  const r = run({ prices: [sale('a', 12100, 30), sale('b', 12100, 60), sale('c', 12100, 90), sale('d', 10000, 900)] });
  assert.equal(r.inputs.t12, null);
  assert.ok(Math.abs(r.inputs.t36 - 0.1) < 1e-9);
  assert.equal(r.parts.trend, 15);
});

test('falling 10% a year or worse gives zero trend points', () => {
  const r = run({ prices: [sale('a', 8000, 30), sale('b', 8000, 60), sale('c', 10000, 400)] });
  assert.equal(r.parts.trend, 0);
});

test('unknown edition size scores 0 for size; closed distillery adds 8; age bonus', () => {
  const prices = [sale('a', 1, 10), sale('b', 1, 20), sale('c', 1, 30)];
  assert.equal(run({ prices }).parts.scarcity, 0);
  assert.equal(run({ prices, distilleryStatus: 'closed' }).parts.scarcity, 8);
  assert.equal(run({ prices, distilleryStatus: 'closed', edition: { ...base, edition_size: 90, age_years: 40 } }).parts.scarcity, 25);
});

test('fundamentals decay with age of the news and stay within 0-10', () => {
  const prices = [sale('a', 1, 10), sale('b', 1, 20), sale('c', 1, 30)];
  const fresh = run({ prices, news: [{ id: 'n', direction: 1, importance: 5, published_at: daysAgo(0) }] });
  const half = run({ prices, news: [{ id: 'n', direction: 1, importance: 5, published_at: daysAgo(90) }] });
  const old = run({ prices, news: [{ id: 'n', direction: 1, importance: 5, published_at: daysAgo(200) }] });
  assert.equal(fresh.parts.fundamentals, 6);
  assert.equal(half.inputs.news[0].delta, 0.5);
  assert.equal(old.parts.fundamentals, 5);
  const many = run({ prices, news: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, direction: -1, importance: 5, published_at: daysAgo(1) })) });
  assert.equal(many.parts.fundamentals, 0);
});

test('missing bottling year with duplicate names, or wrong bottle size -> needs_review', () => {
  const prices = [sale('a', 1, 10), sale('b', 1, 20), sale('c', 1, 30)];
  assert.equal(run({ prices, edition: { ...base, bottling_year: null }, sameNameCount: 2 }).status, 'needs_review');
  assert.equal(run({ prices: [...prices.slice(1), { ...prices[0], volume_ml: 750 }] }).status, 'needs_review');
});

test('RRR: denominator <= 0 or missing input -> cannot be computed', () => {
  const sales = [{ hkd: 100000 }, { hkd: 100000 }];
  const ed = { target_price_minor: 150000, target_currency: 'HKD', floor_price_minor: 100000, floor_currency: 'HKD' };
  assert.equal(investorCard({ edition: ed, recentSales: sales, exitCostPct: 15, convert: hkd, now: NOW }).rrr, null);
  assert.equal(investorCard({ edition: { ...ed, floor_price_minor: null }, recentSales: sales, exitCostPct: 15, convert: hkd, now: NOW }).rrr, null);
  // (150000 - 22500 - 100000) / (100000 - 80000) = 1.375
  assert.equal(investorCard({ edition: { ...ed, floor_price_minor: 80000 }, recentSales: sales, exitCostPct: 15, convert: hkd, now: NOW }).rrr, 1.38);
});

test('currency conversion uses the rate on or before the sale date', () => {
  const convert = makeConverter([
    { rate_date: '2026-01-01', base: 'GBP', quote: 'HKD', rate: 10 },
    { rate_date: '2026-06-01', base: 'GBP', quote: 'HKD', rate: 11 },
  ]);
  assert.equal(convert(100, 'GBP', '2026-03-15'), 1000);
  assert.equal(convert(100, 'GBP', '2026-06-01T10:00:00Z'), 1100);
  assert.equal(convert(100, 'HKD', '2026-03-15'), 100);
  assert.equal(convert(100, 'JPY', '2026-03-15'), null);
  const r = scoreEdition({
    edition: base, distilleryStatus: 'active', news: [], now: NOW, convert, settings: {},
    prices: [1, 2, 3].map((i) => ({ id: `g${i}`, price_type: 'auction_total', amount_minor: 1000, currency: 'GBP', observed_at: daysAgo(i * 10), venue: 'X' })),
  });
  assert.equal(r.inputs.recent, 11000);
});

test('same inputs give the same result', () => {
  const prices = [sale('a', 12000, 30), sale('b', 11000, 100), sale('c', 10000, 500), sale('d', 9000, 900, 'B')];
  assert.deepEqual(run({ prices }), run({ prices }));
  assert.equal(median([3, 1, 2]), 2);
});
