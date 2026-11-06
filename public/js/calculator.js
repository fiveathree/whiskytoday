// Import cost calculator page (PLAN.md §13). Everything is computed in the browser; nothing is saved.
import { esc, api, initTheme } from './common.js';
import { REGIONS, CURRENCY, DEFAULTS, TAXES, PARAMS, COST_LABELS, REGION_NAMES, num, costTotal, calcRow, calcTotals } from './calc.js';

const $ = (id) => document.getElementById(id);

// One-sentence tax rule per region (replaces the Excel "formulas" sheet, §13.2).
const NOTES = {
  hk: '烈酒雙層稅：每瓶貨值首 HK$200 抽 100%，超出部分抽 10%；容量超過 1 公升按每公升貨值計。',
  cn: '關稅按到岸價；消費稅 = 從價 20%（組成計稅價格）＋ 從量 ¥0.912／L；增值稅按到岸價＋關稅＋消費稅計 13%。',
  tw: '菸酒稅按容量 × 酒精度 × NT$2.5；營業稅按到岸價＋關稅＋菸酒稅計 5%。',
  mo: '烈酒從價稅 10%（按到岸價）＋ 從量稅 MOP 20／L。',
  jp: '酒稅 37 度或以下 ¥370／L，每超 1 度加 ¥10／L；消費稅按到岸價＋關稅＋酒稅計 10%。',
  sg: '消費稅按每公升純酒精 S$88（容量 × 酒精度）；GST 按到岸價＋消費稅計 9%。',
};

let server = { fx: {}, params: {} };
let region = 'hk';
let showGbp = false;
const state = {}; // region -> { params, rows }

const blankRow = () => ({ name: '', qty: '', price: '', abv: '', volume: '0.7', cost: ['', '', '', ''], cask: ['', ''], open: false });

// Liquid cost can be typed per bottle, or derived from a whole-cask price ÷ bottle count.
const caskOn = (cask) => num(cask[0]) > 0 && num(cask[1]) > 0;
const caskLiquid = (cask) => num(cask[0]) / num(cask[1]);
function effCost(cost, cask) {
  const c = [...cost];
  if (caskOn(cask)) c[0] = caskLiquid(cask);
  return c;
}

// Defaults: Excel seed < members' saved settings < latest daily FX rate.
function defaultsFor(r) {
  const saved = server.params[r] || {};
  const p = { ...DEFAULTS[r], ...saved, cost: [...(saved.cost || DEFAULTS[r].cost)], cask: ['', ''] };
  if (server.fx[r]) p.fx = Number(server.fx[r].rate.toFixed(4));
  return p;
}
function reset(r) {
  state[r] = { params: defaultsFor(r), rows: [blankRow()] };
}

const decimals = (r) => (['jp', 'tw'].includes(r) ? 0 : 2);
const money = (v, r) => v.toLocaleString('en-US', { minimumFractionDigits: decimals(r), maximumFractionDigits: decimals(r) });
const gbp = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

// Unit price source for a row (§13.4): typed price > own four costs > regional cost calculator.
function priceOf(row, s) {
  if (String(row.price).trim() !== '') return { value: num(row.price), mode: '手填' };
  if (row.cost.some((c) => String(c).trim() !== '') || caskOn(row.cask)) return { value: costTotal(effCost(row.cost, row.cask)), mode: '自訂成本' };
  return { value: costTotal(effCost(s.params.cost, s.params.cask)), mode: '跟計算器' };
}

function compute(r) {
  const s = state[r];
  const rows = s.rows.map((row) => ({ ...row, priceInfo: priceOf(row, s) }));
  const results = rows.map((row) => calcRow(r, s.params, { price: row.priceInfo.value, qty: row.qty, abv: row.abv, volume: row.volume }));
  return { rows, results, totals: calcTotals(rows, results) };
}

// ---------- Left column: parameters, cost calculator, tax note ----------
const shown = (unit, v) => (unit === '%' ? +(num(v) * 100).toFixed(4) : v);

function renderSide() {
  const s = state[region];
  const fx = server.fx[region];
  $('side').innerHTML = `
    <div class="calc-box">
      <h3>參數</h3>
      ${PARAMS[region].map(([k, label, unit]) => `<label class="calc-field"><span>${esc(label)}${unit ? ` <i>${unit}</i>` : ''}</span>
        <input class="field num" inputmode="decimal" data-p="${k}" data-unit="${unit}" value="${esc(shown(unit, s.params[k]))}"></label>`).join('')}
      <p class="note">${fx ? `匯率日期：${esc(fx.date)}（每日自動更新）` : '未有每日匯率，暫用 Excel 預設匯率'}</p>
    </div>
    <div class="calc-box">
      <h3>成本計算器（每瓶，GBP）</h3>
      ${COST_LABELS.map((l, i) => `<label class="calc-field"><span>${l}</span>
        <input class="field num" inputmode="decimal" data-c="${i}" value="${esc(s.params.cost[i])}"></label>${i === 0 ? caskInputs(s.params.cask, '') : ''}`).join('')}
      <div class="calc-field total"><span>每瓶成本</span><b id="cost-total"></b></div>
    </div>
    <p class="note calc-note">${esc(NOTES[region])}</p>`;
  $('side').oninput = (ev) => {
    const el = ev.target;
    if (el.dataset.p) state[region].params[el.dataset.p] = el.dataset.unit === '%' ? num(el.value) / 100 : el.value;
    if (el.dataset.c) state[region].params.cost[+el.dataset.c] = el.value;
    if (el.dataset.k2) state[region].params.cask[+el.dataset.k2] = el.value;
    update();
  };
}

// "Whole cask ÷ bottles" inputs under the liquid cost. attr is '' for the side panel or 'data-r="i"' for a row.
function caskInputs(cask, attr) {
  return `<div class="calc-cask"><span>或整桶價</span><input class="field num" inputmode="decimal" ${attr} data-k2="0" value="${esc(cask[0])}" placeholder="GBP">
    <span>÷</span><input class="field num" inputmode="decimal" ${attr} data-k2="1" value="${esc(cask[1])}" placeholder="瓶數"></div>`;
}

// When a cask price is filled in, the liquid input shows the derived average and becomes read-only.
function syncLiquid(input, cost, cask) {
  if (!input) return;
  if (caskOn(cask)) { input.readOnly = true; input.value = caskLiquid(cask).toFixed(2); }
  else if (input.readOnly) { input.readOnly = false; input.value = cost[0]; }
}

// ---------- Right column: wine table ----------
function columns(r) {
  const cur = CURRENCY[r];
  return [
    ['cif', `單瓶到岸貨值（${cur}）`],
    ...TAXES[r].map(([k, l]) => [`tax.${k}`, `單瓶${l}（${cur}）`]),
    ['totalPer', `單瓶含稅總價（${cur}）`],
    ['value', `整批貨值（${cur}）`],
    ['tax', `整批總稅（${cur}）`],
    ['total', `整批含稅總價（${cur}）`],
    ['rate', '總稅率'],
    ...(showGbp ? [['totalGbp', '單瓶含稅總價（GBP）']] : []),
  ];
}

function cellValue(key, res, r) {
  if (key === 'rate') return pct(res.rate);
  if (key === 'totalGbp') return gbp(res.totalGbp);
  if (key.startsWith('tax.')) return money(res.taxes[key.slice(4)], r);
  return money(res[key], r);
}

function renderTable() {
  const s = state[region];
  const cols = columns(region);
  const input = (i, k, v, cls = 'num', ph = '') => `<input class="field ${cls}" ${cls === 'num' ? 'inputmode="decimal"' : ''} data-r="${i}" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph)}">`;
  const span = 6 + cols.length;
  $('table').innerHTML = `<thead><tr>
      <th>酒名</th><th class="num">瓶數</th><th class="num">單價（GBP）</th><th class="num">酒精度 %</th><th class="num">容量 L</th>
      ${cols.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${s.rows.map((row, i) => `<tr>
        <td class="c-name">${input(i, 'name', row.name, 'name', `酒款 ${i + 1}`)}</td>
        <td class="c-in" data-label="瓶數">${input(i, 'qty', row.qty)}</td>
        <td class="price-cell c-in" data-label="單價（GBP）"><div class="price-wrap">${input(i, 'price', row.price)}
          <button type="button" class="expand" data-open="${i}" aria-expanded="${row.open}" title="每行獨立成本">${row.open ? '▴' : '▾'}</button></div>
          <span class="mode" data-mode="${i}"></span></td>
        <td class="c-in" data-label="酒精度 %">${input(i, 'abv', row.abv)}</td>
        <td class="c-in" data-label="容量 L">${input(i, 'volume', row.volume)}</td>
        ${cols.map(([k, l]) => `<td class="num out c-${k.replace('.', '-')}" data-label="${esc(l)}" data-o="${i}:${k}"></td>`).join('')}
        <td class="c-del"><button type="button" class="btn small del" data-del="${i}" ${s.rows.length < 2 ? 'disabled' : ''} aria-label="刪除">×</button></td>
      </tr>${row.open ? `<tr class="cost-row"><td colspan="${span}"><div class="cost-grid"><span class="note">此酒自己嘅成本（GBP）：</span>
        ${COST_LABELS.map((l, c) => `<label>${l}<input class="field num" inputmode="decimal" data-r="${i}" data-rc="${c}" value="${esc(row.cost[c])}"></label>${c === 0 ? caskInputs(row.cask, `data-r="${i}"`) : ''}`).join('')}</div></td></tr>` : ''}`).join('')}
    </tbody>
    <tfoot><tr><td class="c-name">總計</td><td class="num" data-label="瓶數" id="t-qty"></td><td></td><td></td><td></td>
      ${cols.map(([k, l]) => `<td class="num c-${k.replace('.', '-')}" data-label="${esc(l)}" id="t-${k.replace('.', '-')}"></td>`).join('')}<td></td></tr></tfoot>`;
  update();
}

const TOTAL_KEYS = ['value', 'tax', 'total', 'rate'];

function update() {
  const s = state[region];
  const { rows, results, totals } = compute(region);
  const ct = $('cost-total');
  if (ct) ct.textContent = `£${gbp(costTotal(effCost(s.params.cost, s.params.cask)))}`;
  syncLiquid(document.querySelector('#side input[data-c="0"]'), s.params.cost, s.params.cask);
  const cols = columns(region);
  rows.forEach((row, i) => {
    for (const [k] of cols) {
      const td = document.querySelector(`[data-o="${i}:${k}"]`);
      if (td) td.textContent = cellValue(k, results[i], region);
    }
    const priceInput = document.querySelector(`input[data-r="${i}"][data-k="price"]`);
    if (priceInput) priceInput.placeholder = gbp(row.priceInfo.value);
    syncLiquid(document.querySelector(`input[data-r="${i}"][data-rc="0"]`), row.cost, row.cask);
    const mode = document.querySelector(`[data-mode="${i}"]`);
    if (mode) mode.textContent = row.priceInfo.mode;
  });
  $('t-qty').textContent = totals.qty.toLocaleString('en-US');
  for (const [k] of cols) {
    const td = $(`t-${k.replace('.', '-')}`);
    if (td) td.textContent = TOTAL_KEYS.includes(k) ? cellValue(k, totals, region) : '';
  }
  const fx = s.params.fx;
  $('print-params').textContent = `${REGION_NAMES[region]}（${CURRENCY[region]}）· 匯率 GBP→${CURRENCY[region]} ${fx} · ${NOTES[region]}`;
}

function renderRegions() {
  $('regions').innerHTML = REGIONS.map((r) => `<button type="button" role="tab" data-region="${r}" aria-selected="${r === region}">${REGION_NAMES[r]} ${CURRENCY[r]}</button>`).join('');
}

function show(r) {
  region = r;
  renderRegions();
  renderSide();
  renderTable();
}

// ---------- CSV (UTF-8 BOM so Excel shows Chinese correctly) ----------
function downloadCsv() {
  const { rows, results, totals } = compute(region);
  const cols = columns(region);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const raw = (key, res) => (key === 'rate' ? (res.rate == null ? '' : (res.rate * 100).toFixed(1) + '%')
    : (key.startsWith('tax.') ? res.taxes[key.slice(4)] : res[key]).toFixed(key === 'totalGbp' ? 2 : decimals(region)));
  const lines = [
    ['酒名', '瓶數', '單價（GBP）', '單價來源', '酒精度 %', '容量 L', ...cols.map(([, l]) => l)],
    ...rows.map((row, i) => [row.name, num(row.qty), row.priceInfo.value.toFixed(2), row.priceInfo.mode, row.abv, row.volume,
      ...cols.map(([k]) => raw(k, results[i]))]),
    ['總計', totals.qty, '', '', '', '', ...cols.map(([k]) => (TOTAL_KEYS.includes(k) ? raw(k, totals) : ''))],
  ];
  const csv = '﻿' + lines.map((l) => l.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `import-cost-${region}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Events ----------
$('regions').onclick = (ev) => { const b = ev.target.closest('[data-region]'); if (b) show(b.dataset.region); };
// Reset every region: parameters back to defaults (latest FX) and the table back to one blank row.
$('reset-all').onclick = () => {
  if (!confirm('將所有地區嘅數字回復預設？已輸入嘅酒款會清空。')) return;
  REGIONS.forEach(reset);
  show(region);
};
$('add').onclick = () => { state[region].rows.push(blankRow()); renderTable(); };
$('show-gbp').onchange = (ev) => { showGbp = ev.target.checked; renderTable(); };
$('csv').onclick = downloadCsv;
$('print').onclick = () => window.print();
$('table').oninput = (ev) => {
  const el = ev.target;
  const row = state[region].rows[+el.dataset.r];
  if (!row) return;
  if (el.dataset.k) row[el.dataset.k] = el.value;
  if (el.dataset.rc) row.cost[+el.dataset.rc] = el.value;
  if (el.dataset.k2) row.cask[+el.dataset.k2] = el.value;
  update();
};
$('table').onclick = (ev) => {
  const del = ev.target.closest('[data-del]');
  if (del) { state[region].rows.splice(+del.dataset.del, 1); renderTable(); return; }
  const open = ev.target.closest('[data-open]');
  if (open) { const row = state[region].rows[+open.dataset.open]; row.open = !row.open; renderTable(); }
};

initTheme($('theme'));
try { server = await api('calc'); } catch { /* fall back to Excel defaults */ }
REGIONS.forEach(reset);
show('hk');
