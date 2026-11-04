// Market trends page: HMRC Scotch export statistics + trends from our own news data.
import { esc, t, getLang, setLang, applyI18n, initTheme } from './common.js';
import { lineChart, barChart, stackedChart, legend } from './charts.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const S = (i) => css(`--s${i}`);

const COUNTRY_ZH = {
  US: '美國', FR: '法國', IN: '印度', SG: '新加坡', TW: '台灣', ES: '西班牙', DE: '德國', CN: '中國', LV: '拉脫維亞',
  JP: '日本', HK: '香港', KR: '南韓', AE: '阿聯酋', AU: '澳洲', MX: '墨西哥', ZA: '南非', NL: '荷蘭', PL: '波蘭',
  BR: '巴西', CA: '加拿大', TR: '土耳其', IT: '意大利', TH: '泰國', VN: '越南', MY: '馬來西亞', BE: '比利時', PA: '巴拿馬',
};
const ASIA = ['HK', 'TW', 'CN', 'SG', 'JP', 'KR'];
const cname = (c, fallback) => (getLang() === 'en' ? fallback || c : COUNTRY_ZH[c] || fallback || c);

const gbp = (v) => (v >= 1e9 ? `£${(v / 1e9).toFixed(2)}bn` : v >= 1e6 ? `£${(v / 1e6).toFixed(0)}m` : `£${Math.round(v / 1e3)}k`);
const ymLabel = (m, long) => {
  const y = Math.floor(m / 100); const mo = m % 100;
  return long ? `${y}-${String(mo).padStart(2, '0')}` : (mo === 1 ? String(y) : `${String(y).slice(2)}/${mo}`);
};
const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%` : '—');

// Rolling 12-month sums over a month->value map, returned for the requested months.
function rolling(months, map) {
  return months.map((m, i) => {
    if (i < 11) return null;
    let s = 0;
    for (let k = i - 11; k <= i; k++) s += map.get(months[k]) || 0;
    return s;
  });
}

let data;
let active = 'exports';

function renderExports() {
  const ex = data.exports.monthly;
  const months = [...new Set(ex.map((r) => r.month))].sort((a, b) => a - b);
  const bySeg = (seg) => new Map(ex.filter((r) => r.segment === seg).map((r) => [r.month, r.value]));
  const all = rolling(months, bySeg('all_scotch'));
  const sm = rolling(months, bySeg('single_malt'));
  const start = 11;
  const labels = months.slice(start);
  const series = [
    { name: t('seg.all'), color: S(1), points: labels.map((m, i) => ({ x: m, y: all[i + start] })) },
    { name: t('seg.sm'), color: S(2), points: labels.map((m, i) => ({ x: m, y: sm[i + start] })) },
  ];
  legend($('lg-total'), series);
  lineChart($('c-total'), series, { fmt: gbp, xFmt: (m, long) => (long ? ymLabel(m, true) : ymLabel(m)), ariaLabel: t('c.total') });

  const n = all.length - 1;
  const kpi = (label, value, note) => `<div class="stat"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div>${note ? `<div class="n">${esc(note)}</div>` : ''}</div>`;
  $('kpis').innerHTML = [
    kpi(t('k.total'), gbp(all[n]), `${t('k.yoy')} ${pct(all[n], all[n - 12])}`),
    kpi(t('k.sm'), gbp(sm[n]), `${t('k.share')} ${((sm[n] / all[n]) * 100).toFixed(0)}% · ${t('k.yoy')} ${pct(sm[n], sm[n - 12])}`),
    kpi(t('k.latest'), ymLabel(data.latestMonth, true), t('k.lag')),
  ].join('');
}

function renderMarkets() {
  const months = [...new Set(data.exports.asia.map((r) => r.month))].sort((a, b) => a - b);
  const labels = months.slice(11).filter((m) => m >= months[months.length - 1] - 600); // about 5 years
  const series = ASIA.map((c, k) => {
    const map = new Map(data.exports.asia.filter((r) => r.c === c).map((r) => [r.month, r.value]));
    const roll = rolling(months, map);
    return { name: cname(c), color: S(k + 1), points: labels.map((m) => ({ x: m, y: roll[months.indexOf(m)] })) };
  });
  legend($('lg-asia'), series);
  lineChart($('c-asia'), series, { fmt: gbp, xFmt: (m, long) => ymLabel(m, long), ariaLabel: t('c.asia') });
  barChart($('c-top'), data.exports.markets.map((r) => ({ label: cname(r.c, r.name), value: r.last12, note: pct(r.last12, r.prev12) })),
    { fmt: gbp, color: S(1), ariaLabel: t('c.top') });
}

const CAT_GROUPS = [
  ['auction', ['auction', 'record_price']],
  ['closure', ['distillery_closure', 'distillery_reopen']],
  ['deal', ['acquisition', 'market_index', 'fx_trade', 'regulation_tax']],
  ['release', ['limited_release', 'new_release']],
  ['other', ['industry', 'education_history', 'event', 'counterfeit']],
];

function renderNews() {
  const nm = data.news.monthly;
  const yms = [...new Set(nm.map((r) => r.ym))].sort();
  const series = CAT_GROUPS.map(([key, cats], k) => ({
    name: t(`g.${key}`), color: S(k + 1),
    values: yms.map((ym) => nm.filter((r) => r.ym === ym && cats.includes(r.category)).reduce((a, r) => a + r.n, 0)),
  }));
  legend($('lg-cats'), series);
  stackedChart($('c-cats'), yms, series, { fmt: (v) => String(Math.round(v)), xFmt: (s) => s.slice(2).replace('-', '/'), ariaLabel: t('c.cats') });

  const sm = data.news.sentiment;
  const sy = [...new Set(sm.map((r) => r.ym))].sort();
  const sSeries = [
    { name: t('bullish'), color: css('--bull'), values: sy.map((ym) => sm.find((r) => r.ym === ym && r.dir === 'bullish')?.n || 0) },
    { name: t('bearish'), color: css('--bear'), negative: true, values: sy.map((ym) => sm.find((r) => r.ym === ym && r.dir === 'bearish')?.n || 0) },
  ];
  legend($('lg-sent'), sSeries);
  stackedChart($('c-sent'), sy, sSeries, { fmt: (v) => String(Math.round(v)), xFmt: (s) => s.slice(2).replace('-', '/'), diverging: true, ariaLabel: t('c.sent') });

  const ents = data.news.entities;
  $('c-ent').innerHTML = ents.length
    ? ents.map((e) => {
      const dir = e.net > 0 ? 'bullish' : e.net < 0 ? 'bearish' : 'neutral';
      return `<div class="ent"><span>${esc(getLang() === 'en' ? e.name_en : e.name_zh || e.name_en)}</span><span class="tag dir-${dir}">${esc(t(dir))}</span><span class="n">${e.n}</span></div>`;
    }).join('')
    : `<p class="disclaimer">${esc(t('accumulating'))}</p>`;
  $('cats-note').classList.toggle('hidden', yms.length >= 3);
}

const RENDER = { exports: renderExports, markets: renderMarkets, news: renderNews };

function show(tab) {
  active = tab;
  document.querySelectorAll('#ttabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('.tpanel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  if (data) RENDER[tab]();
}

function renderAll() { Object.values(RENDER).forEach((f) => f()); }

async function init() {
  setLang(getLang());
  applyI18n();
  $('lang').textContent = getLang() === 'en' ? '中文' : 'EN';
  initTheme($('theme'));
  $('ttabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  $('lang').addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'zh' : 'en');
    applyI18n();
    $('lang').textContent = getLang() === 'en' ? '中文' : 'EN';
    if (data) RENDER[active]();
  });
  // Theme change swaps chart colours: redraw.
  $('theme').addEventListener('click', () => { if (data) RENDER[active](); });
  // Print: show every panel, draw each at its printed size, then restore.
  $('print').addEventListener('click', () => {
    document.body.classList.add('printing');
    document.querySelectorAll('.tpanel').forEach((p) => p.classList.remove('hidden'));
    renderAll();
    window.print();
  });
  window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); show(active); });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => data && RENDER[active](), 150); });

  try {
    const res = await fetch('/api/trends');
    data = await res.json();
  } catch {
    document.querySelector('.trends').insertAdjacentHTML('beforeend', `<p class="bad">${esc(t('error'))}</p>`);
    return;
  }
  $('asof').textContent = `${t('k.latest')} ${ymLabel(data.latestMonth, true)}`;
  $('src').textContent = `${t('source')}: ${data.source}`;
  show(active);
}

init();
