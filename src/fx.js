// Daily FX rates into fx_rates as "HKD per 1 unit of <base>" (PLAN §2, §5).
// Sources (free, no key): Frankfurter = European Central Bank reference rates (history since 1999);
// ExchangeRate-API open endpoint for TWD, which the ECB does not publish (attribution required).

export const ECB_CURRENCIES = ['USD', 'GBP', 'EUR', 'JPY', 'CNY', 'SGD'];
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
    const twd = er?.rates?.TWD;
    if (er?.result === 'success' && twd > 0) {
      rows.push({ rate_date: new Date(er.time_last_update_unix * 1000).toISOString().slice(0, 10), base: 'TWD', quote: 'HKD', rate: 1 / twd });
    }
  } catch { /* TWD is optional; ECB rates still saved */ }
  await env.DB.batch(rows.map((r) => env.DB.prepare(
    'INSERT OR REPLACE INTO fx_rates (rate_date, base, quote, rate) VALUES (?, ?, ?, ?)',
  ).bind(r.rate_date, r.base, r.quote, r.rate)));
  return rows.length;
}
