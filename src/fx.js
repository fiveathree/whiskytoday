// Daily FX rates into fx_rates as "HKD per 1 unit of <base>" (PLAN §2, §5).
// Sources (free, no key): Frankfurter = European Central Bank reference rates (history since 1999);
// ExchangeRate-API open endpoint for TWD and MOP, which the ECB does not publish (attribution required).

export const ECB_CURRENCIES = ['USD', 'GBP', 'EUR', 'JPY', 'CNY', 'SGD'];
const ER_CURRENCIES = ['TWD', 'MOP'];
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const ER_API = 'https://open.er-api.com/v6/latest/HKD';

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  return res.json();
}

// Frankfurter answers "units of X per 1 HKD"; we store the inverse.
export function frankfurterRows(date, rates) {
  return Object.entries(rates).filter(([, v]) => v > 0).map(([cur, v]) => ({ rate_date: date, base: cur, quote: 'HKD', rate: 1 / v }));
}

export async function fetchFxHistory(from, to) {
  const data = await getJson(`${FRANKFURTER}/${from}..${to}?base=HKD&symbols=${ECB_CURRENCIES.join(',')}`);
  return Object.entries(data.rates).flatMap(([date, rates]) => frankfurterRows(date, rates));
}

export async function refreshFx(env) {
  const rows = [];
  const ecb = await getJson(`${FRANKFURTER}/latest?base=HKD&symbols=${ECB_CURRENCIES.join(',')}`);
  rows.push(...frankfurterRows(ecb.date, ecb.rates));
  try {
    const er = await getJson(ER_API);
    if (er?.result === 'success') {
      const date = new Date(er.time_last_update_unix * 1000).toISOString().slice(0, 10);
      for (const cur of ER_CURRENCIES) {
        const v = er.rates?.[cur];
        if (v > 0) rows.push({ rate_date: date, base: cur, quote: 'HKD', rate: 1 / v });
      }
    }
  } catch { /* TWD / MOP are optional; ECB rates still saved */ }
  await env.DB.batch(rows.map((r) => env.DB.prepare(
    'INSERT OR REPLACE INTO fx_rates (rate_date, base, quote, rate) VALUES (?, ?, ?, ?)',
  ).bind(r.rate_date, r.base, r.quote, r.rate)));
  return rows.length;
}

// Calculator defaults (PLAN §13.3): latest GBP -> local rate from fx_rates (stored as HKD per unit),
// plus members' saved tax / cost defaults ("calc.<region>" JSON in settings). Read only.
const CALC_CURRENCY = { hk: 'HKD', cn: 'CNY', tw: 'TWD', mo: 'MOP', jp: 'JPY', sg: 'SGD' };

export async function calcDefaults(env) {
  const { results } = await env.DB.prepare(
    `SELECT f.base, f.rate, f.rate_date FROM fx_rates f
     JOIN (SELECT base, MAX(rate_date) AS d FROM fx_rates WHERE quote = 'HKD' GROUP BY base) m
       ON m.base = f.base AND m.d = f.rate_date
     WHERE f.quote = 'HKD'`,
  ).all();
  const hkd = Object.fromEntries(results.map((r) => [r.base, r]));
  hkd.HKD = { rate: 1, rate_date: hkd.GBP?.rate_date };
  const fx = {};
  for (const [region, cur] of Object.entries(CALC_CURRENCY)) {
    const g = hkd.GBP, c = hkd[cur];
    if (g && c) fx[region] = { rate: g.rate / c.rate, date: [g.rate_date, c.rate_date].sort()[0] };
  }
  const { results: rows } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'calc.%'").all();
  const params = {};
  for (const r of rows) { try { params[r.key.slice(5)] = JSON.parse(r.value); } catch { /* ignore bad row */ } }
  return { fx, params };
}
