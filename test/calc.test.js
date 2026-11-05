// Golden tests against the owner's Excel sheet "全球多地区威士忌进口动态格计算表 August 2026" (PLAN.md §13.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calcRow, calcTotals, costTotal, num } from '../public/js/calc.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= 0.01, `${msg}: ${a} vs ${b}`);

// Excel sample rows shared by Taiwan, Macau, Japan and Singapore sheets.
const FOUR = [
  { price: 41, qty: 120, abv: 58.6, volume: 0.7 },
  { price: 35, qty: 120, abv: 57, volume: 0.7 },
  { price: 60, qty: 60, abv: 58.4, volume: 0.7 },
  { price: 79.5, qty: 60, abv: 56.4, volume: 0.7 },
];

function check(region, rows, expected, totals) {
  const results = rows.map((r) => calcRow(region, DEFAULTS[region], r));
  expected.forEach((e, i) => {
    const r = results[i];
    close(r.cif, e.cif, `${region}[${i}] cif`);
    for (const [k, v] of Object.entries(e.taxes)) close(r.taxes[k], v, `${region}[${i}] ${k}`);
    close(r.totalPer, e.totalPer, `${region}[${i}] totalPer`);
    close(r.value, e.value, `${region}[${i}] value`);
    close(r.tax, e.tax, `${region}[${i}] tax`);
    close(r.total, e.total, `${region}[${i}] total`);
    close(r.rate, e.rate, `${region}[${i}] rate`);
  });
  if (totals) {
    const t = calcTotals(rows, results);
    assert.equal(t.qty, totals.qty);
    close(t.value, totals.value, `${region} total value`);
    close(t.tax, totals.tax, `${region} total tax`);
    close(t.total, totals.total, `${region} total incl. tax`);
  }
}

test('Hong Kong matches Excel (Whisky A)', () => {
  check('hk', [{ price: 43.82, qty: 230, abv: 0, volume: 0.7 }], [
    { cif: 467.5594, taxes: { duty: 226.75594 }, totalPer: 694.31534, value: 107538.662, tax: 52153.8662, total: 159692.5282, rate: 0.484977823 },
  ]);
  // Excel M10: cost per bottle incl. tax in GBP
  close(calcRow('hk', DEFAULTS.hk, { price: 43.82, qty: 230, volume: 0.7 }).totalGbp, 65.0717282, 'hk totalGbp');
  close(costTotal(DEFAULTS.hk.cost), 43.82, 'hk cost calculator');
});

test('Mainland China matches Excel (Whisky A)', () => {
  check('cn', [{ price: 128.5, qty: 250, abv: 0, volume: 0.7 }], [
    { cif: 1175.775, taxes: { tariff: 58.78875, consumption: 309.4389375, vat: 200.720349375 }, totalPer: 1744.723036875, value: 293943.75, tax: 142237.00921875, total: 436180.75921875, rate: 0.483891932 },
  ]);
  close(costTotal(DEFAULTS.cn.cost), 128.5, 'cn cost calculator');
});

test('Taiwan matches Excel (4 rows + totals)', () => {
  check('tw', FOUR, [
    { cif: 1515.8151, taxes: { tariff: 0, alcohol: 102.55, vat: 80.918255 }, totalPer: 1699.283355, value: 181897.812, tax: 22016.1906, total: 203914.0026, rate: 0.121036039 },
    { cif: 1293.9885, taxes: { alcohol: 99.75, vat: 69.686925 }, totalPer: 1463.425425, value: 155278.62, tax: 20332.431, total: 175611.051, rate: 0.1309416 },
    { cif: 2218.266, taxes: { alcohol: 102.2, vat: 116.0233 }, totalPer: 2436.4893, value: 133095.96, tax: 13093.398, total: 146189.358, rate: 0.098375623 },
    { cif: 2939.20245, taxes: { alcohol: 98.7, vat: 151.8951225 }, totalPer: 3189.7975725, value: 176352.147, tax: 15035.70735, total: 191387.85435, rate: 0.085259565 },
  ], { qty: 360, value: 646624.539, tax: 70477.72695, total: 717102.26595 });
});

test('Macau matches Excel (4 rows + totals)', () => {
  check('mo', FOUR, [
    { cif: 379.3853, taxes: { adval: 37.93853, specific: 14 }, totalPer: 431.32383, value: 45526.236, tax: 6232.6236, total: 51758.8596, rate: 0.136901799 },
    { cif: 323.8655, taxes: { adval: 32.38655, specific: 14 }, totalPer: 370.25205, value: 38863.86, tax: 5566.386, total: 44430.246, rate: 0.143227821 },
    { cif: 555.198, taxes: { adval: 55.5198, specific: 14 }, totalPer: 624.7178, value: 33311.88, tax: 4171.188, total: 37483.068, rate: 0.125216229 },
    { cif: 735.63735, taxes: { adval: 73.563735, specific: 14 }, totalPer: 823.201085, value: 44138.241, tax: 5253.8241, total: 49392.0651, rate: 0.119031116 },
  ], { qty: 360, value: 161840.217, tax: 21224.0217, total: 183064.2387 });
});

test('Japan matches Excel (4 rows + totals)', () => {
  check('jp', FOUR, [
    { cif: 7623.13, taxes: { tariff: 0, liquor: 410.2, ctax: 803.333 }, totalPer: 8836.663, value: 914775.6, tax: 145623.96, total: 1060399.56, rate: 0.15919091 },
    { cif: 6507.55, taxes: { liquor: 399, ctax: 690.655 }, totalPer: 7597.205, value: 780906, tax: 130758.6, total: 911664.6, rate: 0.167444737 },
    { cif: 11155.8, taxes: { liquor: 408.8, ctax: 1156.46 }, totalPer: 12721.06, value: 669348, tax: 93915.6, total: 763263.6, rate: 0.140309077 },
    { cif: 14781.435, taxes: { liquor: 394.8, ctax: 1517.6235 }, totalPer: 16693.8585, value: 886886.1, tax: 114745.41, total: 1001631.51, rate: 0.129380097 },
  ], { qty: 360, value: 3251915.7, tax: 485043.57, total: 3736959.27 });
});

test('Singapore matches Excel (4 rows + totals)', () => {
  check('sg', FOUR, [
    { cif: 60.5242, taxes: { excise: 36.0976, gst: 8.695962 }, totalPer: 105.317762, value: 7262.904, tax: 5375.22744, total: 12638.13144, rate: 0.740093417 },
    { cif: 51.667, taxes: { excise: 35.112, gst: 7.81011 }, totalPer: 94.58911, value: 6200.04, tax: 5150.6532, total: 11350.6932, rate: 0.830745156 },
    { cif: 88.572, taxes: { excise: 35.9744, gst: 11.209176 }, totalPer: 135.755576, value: 5314.32, tax: 2831.01456, total: 8145.33456, rate: 0.532714357 },
    { cif: 117.3579, taxes: { excise: 34.7424, gst: 13.689027 }, totalPer: 165.789327, value: 7041.474, tax: 2905.88562, total: 9947.35962, rate: 0.412681439 },
  ], { qty: 360, value: 25818.738, tax: 16262.78082, total: 42081.51882 });
});

test('Hong Kong threshold: at, below and above HK$200', () => {
  const p = { ...DEFAULTS.hk, fx: 1 };
  close(calcRow('hk', p, { price: 200, qty: 1, volume: 0.7 }).taxes.duty, 200, 'at threshold');
  close(calcRow('hk', p, { price: 150, qty: 1, volume: 0.7 }).taxes.duty, 150, 'below');
  close(calcRow('hk', p, { price: 300, qty: 1, volume: 0.7 }).taxes.duty, 210, 'above');
});

test('Hong Kong over 1 litre is assessed per litre of value', () => {
  const p = { ...DEFAULTS.hk, fx: 1 };
  // 1.5 L worth HK$450 -> HK$300 per litre -> (200 + 100 x 10%) x 1.5 = 315
  close(calcRow('hk', p, { price: 450, qty: 1, volume: 1.5 }).taxes.duty, 315, '1.5 L');
  // exactly 1 L still uses the per-bottle rule
  close(calcRow('hk', p, { price: 450, qty: 1, volume: 1 }).taxes.duty, 225, '1 L');
});

test('Japan liquor tax around 37% ABV', () => {
  const p = DEFAULTS.jp;
  close(calcRow('jp', p, { price: 0, qty: 1, abv: 37, volume: 1 }).taxes.liquor, 370, '37%');
  close(calcRow('jp', p, { price: 0, qty: 1, abv: 30, volume: 1 }).taxes.liquor, 370, '30%');
  close(calcRow('jp', p, { price: 0, qty: 1, abv: 40, volume: 1 }).taxes.liquor, 400, '40%');
});

test('blank input counts as zero and never produces NaN', () => {
  assert.equal(num(''), 0);
  assert.equal(num('abc'), 0);
  assert.equal(num('1,234.5'), 1234.5);
  for (const region of Object.keys(DEFAULTS)) {
    const r = calcRow(region, DEFAULTS[region], { price: '', qty: '', abv: '', volume: '' });
    for (const v of [r.cif, r.taxPer, r.totalPer, r.value, r.tax, r.total, r.totalGbp]) assert.ok(Number.isFinite(v), `${region} finite`);
  }
});

test('zero import value gives no tax rate', () => {
  const r = calcRow('sg', DEFAULTS.sg, { price: 0, qty: 10, abv: 50, volume: 0.7 });
  assert.equal(r.rate, null);
  assert.equal(calcTotals([{ qty: 10 }], [r]).rate, null);
});
