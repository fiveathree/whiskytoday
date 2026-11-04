// One-off: build an SQL file with HMRC Scotch export history, then load it with
//   npx wrangler d1 execute whiskytoday --remote --file <output.sql>
// Usage: node scripts/backfill-trade.mjs 2015 out.sql
import fs from 'node:fs';
import { fetchCountries, fetchExports, SEGMENTS } from '../src/trade.js';

const startYear = Number(process.argv[2] || 2015);
const out = process.argv[3] || 'trade-backfill.sql';
const now = new Date();
const endYear = now.getUTCFullYear();

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const countries = await fetchCountries();
const lines = [];
for (let y = startYear; y <= endYear; y++) {
  for (const segment of Object.keys(SEGMENTS)) {
    const rows = await fetchExports(y * 100 + 1, y * 100 + 12, segment, countries);
    for (const r of rows) {
      lines.push(`INSERT OR REPLACE INTO trade_exports (month, country_id, country_name, country_alpha, segment, value_gbp, lpa) VALUES (${[r.month, r.country_id, r.country_name, r.country_alpha, r.segment, r.value_gbp, r.lpa].map(q).join(', ')});`);
    }
    console.log(y, segment, rows.length);
  }
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log('wrote', lines.length, 'rows to', out);
