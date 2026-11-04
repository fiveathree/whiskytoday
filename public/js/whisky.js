// Public whisky catalogue: list + detail (overview with our Tier and online ratings, public prices, related news).
import { esc, safeUrl, t, getLang, setLang, applyI18n, initTheme, fmtDate } from './common.js';
import { timeChart, legend } from './charts.js';

const $ = (id) => document.getElementById(id);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const state = { q: '', tier: '', category: '', page: 1, pages: 1 };
let current = null;
let currency = 'HKD';

const en = () => getLang() === 'en';
const L = (o, f) => (en() ? o[`${f}_en`] || o[`${f}_zh`] : o[`${f}_zh`] || o[`${f}_en`]);
const money = (minor, c) => (minor == null ? '—' : `${c === 'USD' ? 'US$' : 'HK$'}${Math.round(minor / 100).toLocaleString('en-US')}`);
const tierBadge = (s) => (s?.tier ? `<span class="tier tier-${esc(s.tier)}">${s.tier === 'low' ? (en() ? 'Low' : '低') : esc(s.tier)}</span>` : '');
const ratingText = (r) => `${esc(r.source)} ${r.score != null ? `<b>${esc(r.score)}</b>${r.scale !== 100 ? `/${esc(r.scale)}` : ''}` : ''}${r.award ? ` ${esc(r.award)}` : ''}`;
const PRICE_TYPES = {
  auction_total: ['拍賣成交（連佣金）', 'Auction (incl. premium)'], private_sale: ['私人成交', 'Private sale'],
  auction_hammer: ['拍賣落槌價', 'Hammer price'], dealer_ask: ['酒商叫價', 'Dealer ask'], msrp: ['建議零售價', 'RRP'],
};
const PT_ORDER = ['auction_total', 'private_sale', 'auction_hammer', 'dealer_ask', 'msrp'];
const pt = (k) => (PRICE_TYPES[k] || [k, k])[en() ? 1 : 0];

async function load() {
  const p = new URLSearchParams({ q: state.q, tier: state.tier, category: state.category, page: state.page });
  const cards = $('cards');
  try {
    const d = await (await fetch(`/api/whisky?${p}`)).json();
    state.pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    $('count').textContent = `${d.total} ${t('w.items')}`;
    $('pageinfo').textContent = `${state.page} / ${state.pages}`;
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= state.pages;
    const sel = $('f-cat');
    if (sel.options.length <= 1) sel.innerHTML = `<option value="">${esc(t('any.category'))}</option>${d.categories.map((c) => `<option>${esc(c)}</option>`).join('')}`;
    cards.innerHTML = d.rows.length ? d.rows.map((r) => `
      <button class="card wcard" type="button" data-slug="${esc(r.slug)}">
        ${r.photo ? `<img src="/api/whisky-media/${esc(r.photo)}" alt="" loading="lazy">` : '<div class="wph" aria-hidden="true">WT</div>'}
        <div class="wbody">
          <h2>${esc(L(r, 'name'))}</h2>
          <p>${esc(en() ? r.distillery_en || '' : r.distillery_zh || r.distillery_en || '')}${r.age_years ? ` · ${r.age_years}${en() ? 'yo' : '年'}` : ''}${r.vintage_year ? ` · ${r.vintage_year}` : ''}</p>
          <div class="meta">
            ${tierBadge(r.score)}${r.score?.total != null ? `<span class="wscore">${r.score.total}<small>/100</small></span>` : ''}
            ${(r.ratings || []).map((x) => `<span class="tag">${ratingText(x)}</span>`).join('')}
          </div>
          <div class="meta">${r.lastPublicHkd != null ? `<span>${esc(t('w.last'))} <b>${money(r.lastPublicHkd, 'HKD')}</b> · ${esc(r.lastPublicDate)}</span>` : ''}${r.is_demo ? `<span class="tag">${esc(t('w.demo'))}</span>` : ''}</div>
        </div>
      </button>`).join('') : `<div class="empty">${esc(t('w.empty'))}</div>`;
  } catch {
    cards.innerHTML = `<div class="empty">${esc(t('error'))}</div>`;
  }
}

function overview() {
  const { edition: e, score, ratings, media } = current;
  const photos = media.filter((m) => m.content_type?.startsWith('image/'));
  const docs = media.filter((m) => !m.content_type?.startsWith('image/'));
  const facts = [
    [t('w.distillery'), en() ? e.distillery_en : e.distillery_zh || e.distillery_en],
    [t('w.age'), e.age_years ? `${e.age_years}${en() ? ' years' : ' 年'}` : null],
    [t('w.vintage'), e.vintage_year], [t('w.bottled'), e.bottling_year],
    [t('w.cask'), [e.cask_type, e.cask_number && `#${e.cask_number}`].filter(Boolean).join(' ')],
    [t('w.size'), e.edition_size ? `${e.edition_size.toLocaleString('en-US')} ${en() ? 'bottles' : '瓶'}` : null],
    [t('w.abv'), e.abv ? `${e.abv}%` : null], [t('w.volume'), e.volume_ml ? `${e.volume_ml} ml` : null],
  ].filter(([, v]) => v);
  $('w-body').innerHTML = `
    <div class="wdetail">
      <div class="wgallery">${photos.length ? photos.map((m) => `<img src="/api/whisky-media/${esc(m.id)}" alt="${esc(m.caption || '')}" loading="lazy">`).join('') : '<div class="wph big" aria-hidden="true">WHISKY TODAY</div>'}
        ${docs.map((m) => `<a class="btn small" href="/api/whisky-media/${esc(m.id)}" target="_blank" rel="noopener">${esc(m.caption || t('w.doc'))}</a>`).join(' ')}
        ${media.length ? `<p class="note">${esc(t('w.authNote'))}</p>` : ''}</div>
      <div>
        <div class="rating-row">
          <div class="rbox own"><div class="l">${esc(t('w.ours'))}</div>${score?.tier ? `${tierBadge(score)} <b class="big">${score.total}</b><small>/100</small>` : `<span class="sub">${esc(t(`st.${score?.status || 'none'}`))}</span>`}</div>
          ${ratings.map((r) => `<div class="rbox"><div class="l">${r.url ? `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source)} ↗</a>` : esc(r.source)}</div>
            ${r.score != null ? `<b class="big">${esc(r.score)}</b><small>/${esc(r.scale)}</small>` : ''}${r.award ? `<div>${esc(r.award)}</div>` : ''}
            ${r.votes ? `<div class="sub">${esc(r.votes)} ${esc(t('w.votes'))}</div>` : ''}${r.rated_at ? `<div class="sub">${esc(t('w.checked'))} ${esc(r.rated_at)}</div>` : ''}</div>`).join('')}
        </div>
        <p class="note">${esc(t('w.scoreNote'))}</p>
        <dl class="kv">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${L(e, 'description') ? `<p>${esc(L(e, 'description'))}</p>` : ''}
        ${L(e, 'tasting') ? `<div class="block claim"><h3>${esc(t('w.tasting'))}</h3><p style="margin:0">${esc(L(e, 'tasting'))}</p></div>` : ''}
        ${L(e, 'owner_comment') ? `<div class="block fact"><h3>${esc(t('w.comment'))}</h3><p style="margin:0">${esc(L(e, 'owner_comment'))}</p></div>` : ''}
      </div>
    </div>`;
}

function prices() {
  const ps = current.prices;
  const v = (p) => (currency === 'USD' ? p.usd_minor : p.hkd_minor);
  $('w-body').innerHTML = ps.length ? `
    <div class="toolbar">${['HKD', 'USD'].map((c) => `<button class="btn small${c === currency ? ' solid' : ''}" data-cur="${c}">${c}</button>`).join('')}
      <span class="note">${esc(t('w.fxNote'))}</span></div>
    <div class="viz-legend" id="wl"></div><div class="chart" id="wchart" style="height:230px"></div>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('w.date'))}</th><th>${esc(t('w.type'))}</th><th class="num">${esc(t('w.amount'))}</th><th>${esc(t('w.venue'))}</th></tr></thead>
      <tbody>${[...ps].reverse().map((p) => `<tr><td>${esc(p.observed_at)}</td><td>${esc(pt(p.price_type))}</td><td class="num">${money(v(p), currency)}</td><td>${esc(p.venue || '')}${p.lot_number ? ` · Lot ${esc(p.lot_number)}` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="note">${esc(t('w.noPrices'))}</p>`;
  if (!ps.length) return;
  const series = PT_ORDER.map((k, i) => ({
    name: pt(k), color: css(`--s${i + 1}`), line: k !== 'dealer_ask' && k !== 'msrp',
    points: ps.filter((p) => p.price_type === k && v(p) != null).map((p) => ({ t: Date.parse(p.observed_at), y: v(p) / 100, label: p.venue || '' })),
  })).filter((s) => s.points.length);
  legend($('wl'), series);
  timeChart($('wchart'), series, { fmt: (x) => Math.round(x).toLocaleString('en-US'), height: 230, ariaLabel: t('w.prices') });
  $('w-body').querySelectorAll('[data-cur]').forEach((b) => { b.onclick = () => { currency = b.dataset.cur; prices(); }; });
}

function news() {
  const ns = current.news;
  $('w-body').innerHTML = ns.length ? ns.map((n) => `
    <div class="block fact"><h3>${esc(fmtDate(n.d))}</h3><p style="margin:0 0 4px"><b>${esc(L(n, 'title'))}</b></p>
      <p style="margin:0">${esc(L(n, 'summary') || '')} <a href="${safeUrl(n.canonical_url)}" target="_blank" rel="noopener noreferrer">↗</a></p></div>`).join('')
    : `<p class="note">${esc(t('w.noNews'))}</p>`;
}

const TABS = { overview, prices, news };
function tab(name) {
  $('w-tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  TABS[name]();
}

async function open(slug) {
  try {
    const res = await fetch(`/api/whisky/${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    current = await res.json();
  } catch { return; }
  $('w-title').textContent = L(current.edition, 'name');
  tab('overview');
  if (!$('detail').open) $('detail').showModal();
  history.replaceState(null, '', `/whisky#${encodeURIComponent(slug)}`);
}

function init() {
  setLang(getLang());
  applyI18n();
  $('lang').textContent = en() ? '中文' : 'EN';
  initTheme($('theme'));
  $('f-tier').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.tier = b.dataset.v; state.page = 1;
    $('f-tier').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  });
  $('f-cat').addEventListener('change', (e) => { state.category = e.target.value; state.page = 1; load(); });
  let timer;
  $('q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300); });
  $('prev').addEventListener('click', () => { if (state.page > 1) { state.page--; load(); } });
  $('next').addEventListener('click', () => { if (state.page < state.pages) { state.page++; load(); } });
  $('cards').addEventListener('click', (e) => { const c = e.target.closest('[data-slug]'); if (c) open(c.dataset.slug); });
  $('w-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) tab(b.dataset.tab); });
  $('w-close').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('close', () => history.replaceState(null, '', '/whisky'));
  $('lang').addEventListener('click', () => {
    setLang(en() ? 'zh' : 'en'); applyI18n(); $('lang').textContent = en() ? '中文' : 'EN';
    $('f-cat').innerHTML = ''; load();
    if ($('detail').open && current) { $('w-title').textContent = L(current.edition, 'name'); tab('overview'); }
  });
  load();
  // Deep link: /whisky#<slug> opens that bottling (shareable).
  if (location.hash.length > 1) open(decodeURIComponent(location.hash.slice(1)));
}

init();
