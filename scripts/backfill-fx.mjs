// One-off: ECB FX history (HKD per unit) into an SQL file, then
//   npx wrangler d1 execute whiskytoday --remote --file <output.sql>
// Usage: node scripts/backfill-fx.mjs 2015-01-01 out.sql
import fs from 'node:fs';
import { fetchFxHistory } from '../src/fx.js';

const from = process.argv[2] || '2015-01-01';
const out = process.argv[3] || 'fx-backfill.sql';
const today = new Date().toISOString().slice(0, 10);
const rows = [];
for (let y = Number(from.slice(0, 4)); y <= Number(today.slice(0, 4)); y++) {
  const a = y === Number(from.slice(0, 4)) ? from : `${y}-01-01`;
  const b = y === Number(today.slice(0, 4)) ? today : `${y}-12-31`;
  rows.push(...await fetchFxHistory(a, b));
  console.log(y, rows.length);
}
fs.writeFileSync(out, rows.map((r) => `INSERT OR REPLACE INTO fx_rates (rate_date, base, quote, rate) VALUES ('${r.rate_date}', '${r.base}', 'HKD', ${r.rate});`).join('\n') + '\n');
console.log('wrote', rows.length, 'rows to', out);
