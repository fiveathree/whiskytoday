// Import cost calculator: pure functions shared by the browser page and node tests (PLAN.md §13.6).
// Lives under public/ so the browser can import it as-is; nothing here touches the DOM or the network.

export const REGIONS = ['hk', 'cn', 'tw', 'mo', 'jp', 'sg'];
export const CURRENCY = { hk: 'HKD', cn: 'CNY', tw: 'TWD', mo: 'MOP', jp: 'JPY', sg: 'SGD' };
export const COST_KEYS = ['liquid', 'bottling', 'label', 'logistics'];

// Excel seed values (§13.3). fx is replaced by the latest daily rate when one exists.
// Percentages are stored as fractions (0.1 = 10%).
export const DEFAULTS = {
  hk: { fx: 10.67, base_rate: 1, excess_rate: 0.1, threshold: 200, cost: [19.82, 10, 2, 12] },
  cn: { fx: 9.15, ratio: 1, tariff: 0.05, consumption: 0.2, specific: 0.912, vat: 0.13, cost: [106, 8.5, 2, 12] },
  tw: { fx: 36.9711, tariff: 0, alcohol: 2.5, vat: 0.05, cost: [20, 0, 2, 0] },
  mo: { fx: 9.2533, adval: 0.1, specific: 20, cost: [20, 0, 2, 0] },
  jp: { fx: 185.93, tariff: 0, base: 370, step: 10, ctax: 0.1, cost: [20, 0, 2, 0] },
  sg: { fx: 1.4762, excise: 88, gst: 0.09, cost: [20, 0, 2, 0] },
};

// Per-bottle tax columns for each region, in table order. pct marks parameters shown as percentages.
export const TAXES = {
  hk: [['duty', '雙層烈酒稅', 'Duty']],
  cn: [['tariff', '關稅', 'Tariff'], ['consumption', '消費稅', 'Consumption tax'], ['vat', '增值稅', 'VAT']],
  tw: [['tariff', '關稅', 'Tariff'], ['alcohol', '菸酒稅', 'Alcohol tax'], ['vat', '營業稅', 'Business tax']],
  mo: [['adval', '從價稅', 'Ad valorem'], ['specific', '從量稅', 'Specific tax']],
  jp: [['tariff', '關稅', 'Tariff'], ['liquor', '酒稅', 'Liquor tax'], ['ctax', '消費稅', 'Consumption tax']],
  sg: [['excise', '消費稅', 'Excise'], ['gst', 'GST', 'GST']],
};

// Editable parameters per region: [key, label, unit]. unit '%' means stored as a fraction, shown as percent.
export const PARAMS = {
  hk: [['fx', '匯率 GBP→HKD', ''], ['base_rate', '首段稅率', '%'], ['excess_rate', '超出部分稅率', '%'], ['threshold', '門檻（HK$）', '']],
  cn: [['fx', '匯率 GBP→CNY', ''], ['ratio', '進口單價比例', ''], ['tariff', '關稅', '%'], ['consumption', '消費稅（從價）', '%'], ['specific', '從量稅（¥／L）', ''], ['vat', '增值稅', '%']],
  tw: [['fx', '匯率 GBP→TWD', ''], ['tariff', '關稅', '%'], ['alcohol', '菸酒稅（NT$／L／度）', ''], ['vat', '營業稅', '%']],
  mo: [['fx', '匯率 GBP→MOP', ''], ['adval', '從價稅', '%'], ['specific', '從量稅（MOP／L）', '']],
  jp: [['fx', '匯率 GBP→JPY', ''], ['tariff', '關稅', '%'], ['base', '酒稅（37 度或以下，¥／L）', ''], ['step', '每超 1 度加（¥／L）', ''], ['ctax', '消費稅', '%']],
  sg: [['fx', '匯率 GBP→SGD', ''], ['excise', '消費稅（S$／L 純酒精）', ''], ['gst', 'GST', '%']],
};
export const COST_LABELS = ['酒液', '出口文件及入樽', '標籤', '物流'];
export const REGION_NAMES = { hk: '香港', cn: '內地', tw: '台灣', mo: '澳門', jp: '日本', sg: '新加坡' };

// Blank or non-numeric input counts as 0 (§13.6), never NaN.
export function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export const costTotal = (cost) => (cost || []).reduce((a, c) => a + num(c), 0);

// Hong Kong two-tier duty on one value (HKD).
function hkTier(x, p) {
  return x <= p.threshold ? x * p.base_rate : p.threshold * p.base_rate + (x - p.threshold) * p.excess_rate;
}

// Per-bottle taxes for one region. P = unit price (GBP), V = volume (L), A = ABV as a fraction.
function perBottle(region, p, P, V, A) {
  const R = num(p.fx);
  switch (region) {
    case 'hk': {
      const cif = P * R;
      // Over 1 litre the duty is assessed per litre of value (§13.7 item 2).
      const duty = V > 1 ? V * hkTier(cif / V, p) : hkTier(cif, p);
      return { cif, taxes: { duty } };
    }
    case 'cn': {
      const cif = P * num(p.ratio) * R;
      const tariff = cif * p.tariff;
      const spec = V * p.specific;
      const consumption = ((cif + tariff + spec) / (1 - p.consumption)) * p.consumption + spec;
      const vat = (cif + tariff + consumption) * p.vat;
      return { cif, taxes: { tariff, consumption, vat } };
    }
    case 'tw': {
      const cif = P * R;
      const tariff = cif * p.tariff;
      const alcohol = V * (A * 100) * p.alcohol;
      const vat = (cif + tariff + alcohol) * p.vat;
      return { cif, taxes: { tariff, alcohol, vat } };
    }
    case 'mo': {
      const cif = P * R;
      return { cif, taxes: { adval: cif * p.adval, specific: V * p.specific } };
    }
    case 'jp': {
      const cif = P * R;
      const tariff = cif * p.tariff;
      const liquor = V * (A <= 0.37 ? p.base : p.base + (A * 100 - 37) * p.step);
      const ctax = (cif + tariff + liquor) * p.ctax;
      return { cif, taxes: { tariff, liquor, ctax } };
    }
    case 'sg': {
      const cif = P * R;
      const excise = V * A * p.excise;
      const gst = (cif + excise) * p.gst;
      return { cif, taxes: { excise, gst } };
    }
    default:
      throw new Error(`unknown region ${region}`);
  }
}

// One table row. row = { price, qty, abv (percent, e.g. 58.6), volume (L) }; params = region parameters.
export function calcRow(region, params, row) {
  const p = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, k === 'cost' ? v : num(v)]));
  const P = num(row.price);
  const Q = num(row.qty);
  const V = num(row.volume);
  const A = num(row.abv) / 100;
  const { cif, taxes } = perBottle(region, p, P, V, A);
  const taxPer = Object.values(taxes).reduce((a, c) => a + c, 0);
  const totalPer = cif + taxPer;
  return {
    cif, taxes, taxPer, totalPer,
    value: cif * Q,
    tax: taxPer * Q,
    total: totalPer * Q,
    rate: cif * Q ? (taxPer * Q) / (cif * Q) : null, // null renders as "—"
    totalGbp: p.fx ? totalPer / p.fx : 0,
  };
}

// Totals row: sums plus the weighted tax rate (total tax / total value).
export function calcTotals(rows, results) {
  const qty = rows.reduce((a, r) => a + num(r.qty), 0);
  const value = results.reduce((a, r) => a + r.value, 0);
  const tax = results.reduce((a, r) => a + r.tax, 0);
  const total = results.reduce((a, r) => a + r.total, 0);
  return { qty, value, tax, total, rate: value ? tax / value : null };
}
