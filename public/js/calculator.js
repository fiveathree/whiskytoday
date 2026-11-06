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
let paramsOpen = !matchMedia('(max-width: 860px)').matches; // parameters start folded on phones
let costRow = -1; // row index being edited in the cost dialog
const state = {}; // region -> { params, rows }

// New rows carry the region's preset costs (bottling, label, logistics); liquid is left for the user to fill.
const blankRow = (r) => ({ name: '', qty: '', price: '', abv: '', volume: '0.7', cost: ['', ...defaultsFor(r).cost.slice(1).map(String)], liquid: 'bottle', cask: ['', ''] });

// Liquid cost is one of two choices: a per-bottle price, or a whole-cask price ÷ bottles.
// A blank cask bottle count follows the row's own bottle count.
const caskBottles = (row) => (String(row.cask[1]).trim() !== '' ? num(row.cask[1]) : num(row.qty));
const caskAvg = (row) => (num(row.cask[0]) > 0 && caskBottles(row) > 0 ? num(row.cask[0]) / caskBottles(row) : 0);
function effCost(row) {
  const c = [...row.cost];
  c[0] = row.liquid === 'cask' ? caskAvg(row) : num(row.cost[0]);
  return c;
}

// Defaults: Excel seed < members' saved settings < latest daily FX rate.
function defaultsFor(r) {
  const saved = server.params[r] || {};
  const p = { ...DEFAULTS[r], ...saved, cost: [...(saved.cost || DEFAULTS[r].cost)] };
  if (server.fx[r]) p.fx = Number(server.fx[r].rate.toFixed(4));
  return p;
}
function reset(r) {
  state[r] = { params: defaultsFor(r), rows: [blankRow(r)] };
}

const decimals = (r) => (['jp', 'tw'].includes(r) ? 0 : 2);
const money = (v, r) => v.toLocaleString('en-US', { minimumFractionDigits: decimals(r), maximumFractionDigits: decimals(r) });
const gbp = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

// Unit price source for a row (§13.4): typed price > the row's own four costs.
function priceOf(row) {
  if (String(row.price).trim() !== '') return { value: num(row.price), mode: '手填' };
  return { value: costTotal(effCost(row)), mode: '自訂成本' };
}

function compute(r) {
  const s = state[r];
  const rows = s.rows.map((row) => ({ ...row, priceInfo: priceOf(row) }));
  const results = rows.map((row) => calcRow(r, s.params, { price: row.priceInfo.value, qty: row.qty, abv: row.abv, volume: row.volume }));
  return { rows, results, totals: calcTotals(rows, results) };
}

// ---------- Left column: parameters and tax note ----------
const shown = (unit, v) => (unit === '%' ? +(num(v) * 100).toFixed(4) : v);

function renderSide() {
  const s = state[region];
  const fx = server.fx[region];
  $('side').innerHTML = `
    <details class="calc-box" id="params"${paramsOpen ? ' open' : ''}>
      <summary><h3>參數</h3></summary>
      ${PARAMS[region].map(([k, label, unit]) => `<label class="calc-field"><span>${esc(label)}${unit ? ` <i>${unit}</i>` : ''}</span>
        <input class="field num" inputmode="decimal" data-p="${k}" data-unit="${unit}" value="${esc(shown(unit, s.params[k]))}"></label>`).join('')}
      <p class="note">${fx ? `匯率日期：${esc(fx.date)}（每日自動更新）` : '未有每日匯率，暫用 Excel 預設匯率'}</p>
    </details>
    <p class="note calc-note">${esc(NOTES[region])}</p>`;
  $('params').ontoggle = (ev) => { paramsOpen = ev.target.open; };
  $('side').oninput = (ev) => {
    const el = ev.target;
    if (el.dataset.p) state[region].params[el.dataset.p] = el.dataset.unit === '%' ? num(el.value) / 100 : el.value;
    update();
  };
}

// ---------- Cost dialog (opened from the arrow beside a row's unit price) ----------
function openCost(i) {
  costRow = i;
  const row = state[region].rows[i];
  const f = (k, v, ph = '') => `<input class="field num" inputmode="decimal" data-dc="${k}" value="${esc(v)}" placeholder="${esc(ph)}">`;
  $('cost-title').textContent = `${row.name || `酒款 ${i + 1}`} · 每瓶成本（GBP）`;
  $('cost-body').innerHTML = `
    <p class="calc-step">① 酒液成本：二揀一</p>
    <label class="calc-choice"><input type="radio" name="liquid" value="bottle"${row.liquid === 'cask' ? '' : ' checked'}><span>每瓶酒液價</span>${f('cost0', row.cost[0], 'GBP')}</label>
    <label class="calc-choice"><input type="radio" name="liquid" value="cask"${row.liquid === 'cask' ? ' checked' : ''}><span>整桶價</span>${f('cask0', row.cask[0], 'GBP')}
      <span>÷</span>${f('cask1', row.cask[1], num(row.qty) ? `跟瓶數 ${num(row.qty)}` : '瓶數')}</label>
    <p class="note" id="cask-avg"></p>
    <p class="calc-step">② 其他費用（已預設，可改）</p>
    ${COST_LABELS.slice(1).map((l, c) => `<label class="calc-field"><span>${l}</span>${f(`cost${c + 1}`, row.cost[c + 1])}</label>`).join('')}
    <div class="calc-field total"><span>每瓶成本</span><b id="cost-total"></b></div>
    <button class="btn solid" type="submit">完成</button>`;
  syncCost();
  $('cost-dlg').showModal();
}

// Only the chosen liquid option is editable; show the cask average and the running total.
function syncCost() {
  const row = state[region].rows[costRow];
  const body = $('cost-body');
  body.querySelector('[data-dc="cost0"]').disabled = row.liquid === 'cask';
  body.querySelectorAll('[data-dc^="cask"]').forEach((el) => { el.disabled = row.liquid !== 'cask'; });
  $('cask-avg').textContent = row.liquid === 'cask' ? `每瓶酒液 = £${gbp(caskAvg(row))}` : '';
  $('cost-total').textContent = `£${gbp(costTotal(effCost(row)))}`;
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
        <td class="c-name" data-label="酒名">${input(i, 'name', row.name, 'name', `酒款 ${i + 1}`)}</td>
        <td class="c-in" data-label="瓶數">${input(i, 'qty', row.qty)}</td>
        <td class="price-cell c-in" data-label="單價（GBP）"><div class="price-wrap">${input(i, 'price', row.price)}
          <button type="button" class="expand" data-open="${i}" title="每瓶成本">▾</button></div>
          <span class="mode" data-mode="${i}"></span></td>
        <td class="c-in" data-label="酒精度 %">${input(i, 'abv', row.abv)}</td>
        <td class="c-in" data-label="容量 L">${input(i, 'volume', row.volume)}</td>
        ${cols.map(([k, l]) => `<td class="num out c-${k.replace('.', '-')}" data-label="${esc(l)}" data-o="${i}:${k}"></td>`).join('')}
        <td class="c-del"><button type="button" class="btn small del" data-del="${i}" ${s.rows.length < 2 ? 'disabled' : ''} aria-label="刪除">×</button></td>
      </tr>`).join('')}
      <tr class="add-row"><td colspan="${span}"><button class="btn small" type="button" data-add>＋ 加一款酒</button></td></tr>
    </tbody>
    <tfoot><tr><td class="c-name">總計</td><td class="num" data-label="瓶數" id="t-qty"></td><td></td><td></td><td></td>
      ${cols.map(([k, l]) => `<td class="num c-${k.replace('.', '-')}" data-label="${esc(k === 'totalPer' ? `平均每瓶含稅價（${CURRENCY[region]}）` : l)}" id="t-${k.replace('.', '-')}"></td>`).join('')}<td></td></tr></tfoot>`;
  update();
}

const TOTAL_KEYS = ['value', 'tax', 'total', 'rate', 'perBottle'];

function update() {
  const s = state[region];
  const { rows, results, totals } = compute(region);
  const cols = columns(region);
  rows.forEach((row, i) => {
    for (const [k] of cols) {
      const td = document.querySelector(`[data-o="${i}:${k}"]`);
      if (td) td.textContent = cellValue(k, results[i], region);
    }
    const priceInput = document.querySelector(`input[data-r="${i}"][data-k="price"]`);
    if (priceInput) priceInput.placeholder = gbp(row.priceInfo.value);
    const mode = document.querySelector(`[data-mode="${i}"]`);
    if (mode) mode.textContent = row.priceInfo.mode;
  });
  $('t-qty').textContent = totals.qty.toLocaleString('en-US');
  for (const [k] of cols) {
    const td = $(`t-${k.replace('.', '-')}`);
    if (td) td.textContent = TOTAL_KEYS.includes(k) ? cellValue(k, totals, region) : '';
    if (td && k === 'totalPer') td.textContent = totals.perBottle == null ? '' : money(totals.perBottle, region);
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
  const raw = (key, res) => (key === 'totalPer' && res.perBottle !== undefined ? (res.perBottle == null ? '' : res.perBottle.toFixed(decimals(region)))
    : key === 'rate' ? (res.rate == null ? '' : (res.rate * 100).toFixed(1) + '%')
    : (key.startsWith('tax.') ? res.taxes[key.slice(4)] : res[key]).toFixed(key === 'totalGbp' ? 2 : decimals(region)));
  const lines = [
    ['酒名', '瓶數', '單價（GBP）', '單價來源', '酒精度 %', '容量 L', ...cols.map(([, l]) => l)],
    ...rows.map((row, i) => [row.name, num(row.qty), row.priceInfo.value.toFixed(2), row.priceInfo.mode, row.abv, row.volume,
      ...cols.map(([k]) => raw(k, results[i]))]),
    ['總計', totals.qty, '', '', '', '', ...cols.map(([k]) => (TOTAL_KEYS.includes(k) || k === 'totalPer' ? raw(k, totals) : ''))],
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
$('cost-body').oninput = (ev) => {
  const el = ev.target;
  const row = state[region].rows[costRow];
  if (!row) return;
  if (el.name === 'liquid') row.liquid = el.value;
  const k = el.dataset.dc;
  if (k) (k.startsWith('cask') ? row.cask : row.cost)[+k.slice(-1)] = el.value;
  syncCost();
  update();
};
$('show-gbp').onchange = (ev) => { showGbp = ev.target.checked; renderTable(); };
$('csv').onclick = downloadCsv;
$('print').onclick = () => window.print();
$('table').oninput = (ev) => {
  const el = ev.target;
  const row = state[region].rows[+el.dataset.r];
  if (!row) return;
  if (el.dataset.k) row[el.dataset.k] = el.value;
  update();
};
$('table').onclick = (ev) => {
  const del = ev.target.closest('[data-del]');
  if (del) { state[region].rows.splice(+del.dataset.del, 1); renderTable(); return; }
  if (ev.target.closest('[data-add]')) { state[region].rows.push(blankRow(region)); renderTable(); return; }
  const open = ev.target.closest('[data-open]');
  if (open) openCost(+open.dataset.open);
};

initTheme($('theme'));
try { server = await api('calc'); } catch { /* fall back to Excel defaults */ }
REGIONS.forEach(reset);
show('hk');
