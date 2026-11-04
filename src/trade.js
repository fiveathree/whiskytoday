// Scotch whisky export statistics from the HMRC OData API (uktradeinfo.com, Open Government Licence v3.0).
// Only this fixed host is fetched (no URLs from external content).

const API = 'https://api.uktradeinfo.com';

// HS 2208.30 whiskies: CN8 codes 22083030–22083079 are Scotch (11/19 bourbon and 82/88 other whisky excluded).
export const SEGMENTS = {
  all_scotch: 'CommodityId ge 22083030 and CommodityId le 22083079',
  single_malt: '(CommodityId eq 22083030 or CommodityId eq 22083032 or CommodityId eq 22083038)',
};

// FlowTypeId 2 = EU exports, 4 = non-EU exports.
export function exportQuery(fromMonth, toMonth, segment) {
  const filter = `MonthId ge ${fromMonth} and MonthId le ${toMonth} and (FlowTypeId eq 2 or FlowTypeId eq 4) and ${SEGMENTS[segment]}`;
  const apply = `filter(${filter})/groupby((MonthId,CountryId),aggregate(Value with sum as Value,SuppUnit with sum as Lpa))`;
  return `${API}/OTS?$apply=${encodeURIComponent(apply)}`;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HMRC API HTTP ${res.status}`);
  return res.json();
}

export async function fetchCountries() {
  const data = await getJson(`${API}/Country?$select=CountryId,CountryName,CountryCodeAlpha`);
  return new Map(data.value.map((c) => [c.CountryId, { name: c.CountryName?.trim(), alpha: c.CountryCodeAlpha?.trim() }]));
}

// Returns rows ready for trade_exports.
export async function fetchExports(fromMonth, toMonth, segment, countries) {
  const data = await getJson(exportQuery(fromMonth, toMonth, segment));
  return data.value.map((r) => {
    const c = countries.get(r.CountryId) || {};
    return {
      month: r.MonthId, country_id: r.CountryId, country_name: c.name || null, country_alpha: c.alpha || null,
      segment, value_gbp: Math.round(r.Value || 0), lpa: Math.round(r.Lpa || 0),
    };
  });
}

export function monthsAgo(n, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - n, 1));
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
}

// Called from the daily run: re-pull the last 6 months (HMRC publishes ~6 weeks late and revises).
export async function refreshTrade(env) {
  const countries = await fetchCountries();
  const from = monthsAgo(6);
  const to = monthsAgo(0);
  let n = 0;
  for (const segment of Object.keys(SEGMENTS)) {
    const rows = await fetchExports(from, to, segment, countries);
    const stmts = rows.map((r) => env.DB.prepare(
      `INSERT INTO trade_exports (month, country_id, country_name, country_alpha, segment, value_gbp, lpa)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(month, country_id, segment) DO UPDATE SET value_gbp = excluded.value_gbp, lpa = excluded.lpa,
         country_name = excluded.country_name, country_alpha = excluded.country_alpha`,
    ).bind(r.month, r.country_id, r.country_name, r.country_alpha, r.segment, r.value_gbp, r.lpa));
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    n += rows.length;
  }
  return n;
}
