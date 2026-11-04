// News page (PLAN.md §4.7)
import { esc, safeUrl, t, pick, getLang, setLang, applyI18n, api, fmtDate, REGION, CATEGORY } from './common.js';

const $ = (id) => document.getElementById(id);
const state = { view: '', region: '', category: '', from: '', to: '', q: '', page: 1, pages: 1 };
let current = null;

const L = (row, field) => (getLang() === 'en' ? row[`${field}_en`] || row[`${field}_zh`] : row[`${field}_zh`] || row[`${field}_en`]);

function fillSelects() {
  const opt = (v, label, sel) => `<option value="${v}"${sel === v ? ' selected' : ''}>${esc(label)}</option>`;
  $('f-region').innerHTML = opt('', t('any'), state.region)
    + Object.entries(REGION).map(([k, v]) => opt(k, pick(v), state.region)).join('');
  $('f-category').innerHTML = opt('', t('any'), state.category)
    + Object.entries(CATEGORY).map(([k, v]) => opt(k, pick(v), state.category)).join('');
}

function dirTag(dir) {
  if (!dir) return '';
  return `<span class="tag dir-${esc(dir)}">${esc(t(dir))}</span>`;
}

async function load() {
  const p = new URLSearchParams();
  for (const k of ['view', 'region', 'category', 'from', 'to', 'q']) if (state[k]) p.set(k, state[k]);
  p.set('page', state.page);
  const cards = $('cards');
  try {
    const d = await api(`news?${p}`);
    state.pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    $('mine-count').textContent = d.affectingMine;
    $('count').textContent = `${d.total} ${t('items')}`;
    $('pageinfo').textContent = `${state.page} / ${state.pages}`;
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= state.pages;
    if (!d.items.length) {
      cards.innerHTML = `<div class="empty">${esc(t('empty'))}</div>`;
      return;
    }
    cards.innerHTML = d.items.map((a) => `
      <button class="card" type="button" data-id="${esc(a.id)}">
        <h2>${esc(L(a, 'title'))}</h2>
        <p>${esc(L(a, 'summary'))}</p>
        <div class="meta">
          ${a.investor_focus ? `<span class="badge">${esc(t('focus'))}</span>` : ''}
          ${dirTag(a.direction)}
          ${a.category ? `<span class="tag">${esc(pick(CATEGORY[a.category]))}</span>` : ''}
          <span class="tag">${esc(pick(REGION[a.region]))}</span>
          <span>${a.source_count} ${esc(t('sources.n'))}</span>
          <span>· ${esc(fmtDate(a.published_at || a.fetched_at))}</span>
        </div>
      </button>`).join('');
  } catch {
    cards.innerHTML = `<div class="empty">${esc(t('error'))}</div>`;
  }
}

function list(items) {
  return `<ul>${items.map((x) => `<li>${esc(x.text)} <a class="src" href="${safeUrl(x.url)}" target="_blank" rel="noopener noreferrer">↗</a></li>`).join('')}</ul>`;
}

function renderTab(tab) {
  const a = current;
  if (!a) return;
  document.querySelectorAll('#d-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const body = $('d-body');
  if (tab === 'summary') {
    body.innerHTML = `
      <p>${esc(L(a, 'summary'))}</p>
      ${a.facts.length ? `<div class="block fact"><h3>${esc(t('facts'))}</h3>${list(a.facts)}</div>` : ''}
      ${a.claims.length ? `<div class="block claim"><h3>${esc(t('claims'))}</h3>${list(a.claims)}</div>` : ''}
      ${L(a, 'ai_view') ? `<div class="block ai"><h3>${esc(t('ai'))}</h3><p style="margin:0">${esc(L(a, 'ai_view'))}</p></div>` : ''}
      ${a.entities.length ? `<div><h3 class="disclaimer" style="font-family:var(--sans)">${esc(t('entities'))}</h3>
        <div class="meta">${a.entities.map((e) => `<span class="tag">${esc(getLang() === 'en' ? e.name_en : e.name_zh || e.name_en)}</span>`).join('')}</div></div>` : ''}
      <p class="disclaimer">${esc(t('disclaimer'))}</p>`;
  } else if (tab === 'investor') {
    const c = a.investor_card;
    if (!c) { body.innerHTML = `<p class="disclaimer">${esc(t('no.card'))}</p>`; return; }
    const en = getLang() === 'en';
    body.innerHTML = `
      <div class="block card-inv">
        <dl class="kv">
          <dt>${esc(t('dir'))}</dt><dd>${dirTag(c.direction)}</dd>
          <dt>${esc(t('horizon'))}</dt><dd>${esc(t(c.horizon))}</dd>
          <dt>${esc(t('affected'))}</dt><dd>${(c.affected || []).map((x) => `${esc(x.entity)} ${dirTag(x.direction > 0 ? 'bullish' : x.direction < 0 ? 'bearish' : 'neutral')}`).join('　')}</dd>
        </dl>
      </div>
      ${c.evidence?.length ? `<div class="block fact"><h3>${esc(t('evidence'))}</h3><ul>${c.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      <div class="block ai"><h3>${esc(t('reasoning'))}</h3><p style="margin:0 0 6px">${esc(en ? c.ai_reasoning_en : c.ai_reasoning_zh)}</p><p class="disclaimer" style="margin:0">${esc(t('ai.note'))}</p></div>
      ${c.watch_next_zh ? `<div class="block claim"><h3>${esc(t('watch'))}</h3><p style="margin:0">${esc(c.watch_next_zh)}</p></div>` : ''}`;
  } else {
    body.innerHTML = `<div class="src-list">${a.sources.map((s) => `
      <p style="margin:0 0 10px"><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><br>
      <span class="disclaimer">${esc(s.name)} · ${esc(fmtDate(s.published_at))}</span></p>`).join('')}</div>`;
  }
}

async function openDetail(id) {
  try {
    current = await api(`news/${encodeURIComponent(id)}`);
  } catch { return; }
  $('d-title').textContent = L(current, 'title');
  renderTab('summary');
  $('detail').showModal();
}

function setView(v) {
  state.view = v;
  state.page = 1;
  document.querySelectorAll('#f-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  load();
}

function init() {
  setLang(getLang());
  applyI18n();
  $('lang').textContent = getLang() === 'en' ? '中文' : 'EN';
  fillSelects();

  $('f-view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
  $('mine-bar').addEventListener('click', () => setView('mine'));
  for (const [id, key] of [['f-region', 'region'], ['f-category', 'category'], ['f-from', 'from'], ['f-to', 'to']]) {
    $(id).addEventListener('change', (e) => { state[key] = e.target.value; state.page = 1; load(); });
  }
  let timer;
  $('q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300);
  });
  $('prev').addEventListener('click', () => { if (state.page > 1) { state.page--; load(); } });
  $('next').addEventListener('click', () => { if (state.page < state.pages) { state.page++; load(); } });
  $('cards').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) openDetail(c.dataset.id); });
  $('d-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) renderTab(b.dataset.tab); });
  $('d-close').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', (e) => { if (e.target === $('detail')) $('detail').close(); });
  $('lang').addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'zh' : 'en');
    applyI18n();
    $('lang').textContent = getLang() === 'en' ? '中文' : 'EN';
    fillSelects();
    load();
  });

  api('me').then((me) => {
    $('who').textContent = me.email;
    if (me.role === 'admin') $('nav-admin').classList.remove('hidden');
  }).catch(() => {});
  load();
}

init();
