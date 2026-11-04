// Admin page: job log, sources, tracked entities, unmatched names (PLAN.md §4.6, §11 phase 1 step 4).
import { esc, safeUrl, api, fmtDate, toast, initTheme, REGION } from './common.js';

const $ = (id) => document.getElementById(id);
const panel = $('panel');
const PAGE = 12;
let tab = 'jobs';
let page = 1;

const pager = (total, render) => {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return `<div class="pager"><button class="btn small" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>上一頁</button>
    <span>${page} / ${pages}</span><button class="btn small" data-pg="1" ${page >= pages ? 'disabled' : ''}>下一頁</button></div>`;
};
const regionOpts = (sel) => Object.entries(REGION).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v[0]}</option>`).join('');
const usd = (cents) => `US$${(Number(cents || 0) / 100).toFixed(2)}`;

async function renderJobs() {
  const d = await api('admin/jobs');
  const last = d.jobs.find((j) => j.job === 'collect');
  panel.innerHTML = `
    <div class="toolbar">
      <div class="stat-row">
        <div class="stat"><div class="v">${usd(d.monthCostCents)}</div><div class="l">本月 AI 成本（估算）</div></div>
        <div class="stat"><div class="v">${last ? esc(fmtDate(last.started_at)) : '—'}</div><div class="l">最近一次收集</div></div>
        <div class="stat"><div class="v">${d.failed.length}</div><div class="l">AI 處理失敗</div></div>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button class="btn" id="run">立即收集新聞</button>
      <button class="btn" id="digest">寄出今日簡報</button>
      ${d.failed.length ? '<button class="btn" id="retry">重試失敗項目</button>' : ''}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>工作</th><th>開始</th><th>狀態</th><th class="num">新增</th><th class="num">AI 處理</th><th class="num">成本</th><th>錯誤</th></tr></thead>
      <tbody>${d.jobs.map((j) => `<tr>
        <td>${j.job === 'collect' ? '收集新聞' : '每日簡報'}</td>
        <td>${esc(fmtDate(j.started_at))}</td>
        <td class="${j.status === 'ok' ? 'ok' : j.status === 'running' ? '' : 'bad'}">${esc(j.status)}</td>
        <td class="num">${j.items_found ?? ''}</td><td class="num">${j.items_processed ?? ''}</td>
        <td class="num">${j.cost_estimate != null ? usd(j.cost_estimate) : ''}</td>
        <td class="err" title="${esc(j.error)}">${esc(j.error)}</td></tr>`).join('') || '<tr><td colspan="7">未有紀錄</td></tr>'}
      </tbody></table></div>
    <div class="toolbar"><span class="note">每日 07:00 及 19:00（香港／台北時間）自動收集；07:00 那輪完成後寄簡報。</span></div>`;
  const runBtn = async (btn, path, busyText, doneText) => {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText;
    try { await api(path, { method: 'POST' }); toast(doneText); } catch (e) { toast(`未完成：${e.message}`); }
    btn.disabled = false;
    btn.textContent = label;
    renderJobs();
  };
  $('run').onclick = () => runBtn($('run'), 'admin/run', '收集中…約 3–5 分鐘，請勿關閉此頁', '收集完成');
  $('digest').onclick = () => runBtn($('digest'), 'admin/digest', '寄出中…', '已處理，結果見工作紀錄');
  if ($('retry')) $('retry').onclick = async () => { await api('admin/retry-failed', { method: 'POST' }); toast('失敗項目會喺下次收集時重試'); renderJobs(); };
}

async function renderSources() {
  const all = await api('admin/sources');
  const rows = all.slice((page - 1) * PAGE, page * PAGE);
  panel.innerHTML = `
    <form class="inline" id="add">
      <input class="field" name="name" placeholder="名稱" required>
      <input class="field" name="feed_url" placeholder="RSS / Atom 網址" type="url" required>
      <select class="field" name="region">${regionOpts('other')}</select>
      <select class="field" name="kind"><option value="news">新聞</option><option value="auction">拍賣</option><option value="blog">Blog</option><option value="official">官方</option></select>
      <input class="field" name="filter_keywords" placeholder="關鍵字過濾（可留空，逗號分隔）">
      <button class="btn solid">新增來源</button>
    </form>
    <div class="table-wrap"><table>
      <thead><tr><th>啟用</th><th>來源</th><th>地區</th><th>類型</th><th class="num">文章</th><th>最近讀取</th><th>錯誤</th></tr></thead>
      <tbody>${rows.map((s) => `<tr>
        <td><input type="checkbox" class="switch" data-src="${esc(s.id)}" ${s.is_active ? 'checked' : ''} aria-label="啟用 ${esc(s.name)}"></td>
        <td><a href="${safeUrl(s.home_url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>${s.filter_keywords ? ' <span class="tag">過濾</span>' : ''}</td>
        <td>${esc((REGION[s.region] || [s.region])[0])}</td><td>${esc(s.kind)}</td>
        <td class="num">${s.article_count}</td><td>${esc(fmtDate(s.last_fetched_at))}</td>
        <td class="err" title="${esc(s.last_error)}">${esc(s.last_error)}</td></tr>`).join('')}
      </tbody></table></div>
    ${pager(all.length)}`;
  $('add').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('admin/sources', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast('已新增'); renderSources();
    } catch (err) { toast(err.message); }
  };
  panel.querySelectorAll('[data-src]').forEach((cb) => {
    cb.onchange = async () => { await api(`admin/sources/${encodeURIComponent(cb.dataset.src)}`, { method: 'PATCH', body: { is_active: cb.checked } }); toast(cb.checked ? '已啟用' : '已停用'); };
  });
}

async function renderTracked(q = '') {
  const rows = await api(`admin/entities?q=${encodeURIComponent(q)}`);
  panel.innerHTML = `
    <div class="toolbar">
      <input class="field" id="eq" placeholder="搜尋酒廠／品牌／拍賣行" value="${esc(q)}" style="max-width:320px">
      <span class="note">打剔＝追蹤。追蹤中的名稱只用於每日簡報第一段（只寄俾你），公開頁唔會顯示。</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>追蹤</th><th>名稱</th><th>中文</th><th>類型</th><th>地區</th><th>狀況</th></tr></thead>
      <tbody>${rows.slice(0, PAGE + 2).map((e) => `<tr>
        <td><input type="checkbox" class="switch" data-ent="${esc(e.id)}" ${e.is_tracked ? 'checked' : ''} aria-label="追蹤 ${esc(e.name_en)}"></td>
        <td>${esc(e.name_en)}</td><td>${esc(e.name_zh)}</td><td>${esc(e.type)}</td>
        <td>${esc((REGION[e.region] || [e.region || ''])[0])}</td><td>${esc(e.status || '')}</td></tr>`).join('') || '<tr><td colspan="6">搵唔到</td></tr>'}
      </tbody></table></div><div></div>`;
  let timer;
  $('eq').oninput = (ev) => { clearTimeout(timer); timer = setTimeout(() => renderTracked(ev.target.value).then(() => { $('eq').focus(); $('eq').setSelectionRange(99, 99); }), 300); };
  panel.querySelectorAll('[data-ent]').forEach((cb) => {
    cb.onchange = async () => { await api(`admin/entities/${encodeURIComponent(cb.dataset.ent)}`, { method: 'PATCH', body: { is_tracked: cb.checked } }); toast(cb.checked ? '已追蹤' : '已取消追蹤'); };
  });
}

async function renderUnmatched() {
  const rows = await api('admin/unmatched');
  const types = { distillery: '酒廠', brand: '品牌', company: '公司', bottler: '獨立裝瓶商', auction_house: '拍賣行' };
  panel.innerHTML = `
    <div class="toolbar"><span class="note">AI 喺新聞見到、但資料庫未有嘅名稱。按「加入」就會之後自動配對；唔需要就按「略過」。</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>名稱</th><th>類型</th><th class="num">出現次數</th><th>最近</th><th></th></tr></thead>
      <tbody>${rows.slice(0, PAGE + 2).map((u, i) => `<tr>
        <td>${esc(u.name)}</td>
        <td><select class="field" id="ut${i}" style="width:auto">${Object.entries(types).map(([k, v]) => `<option value="${k}"${k === u.type ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="num">${u.seen_count}</td><td>${esc(fmtDate(u.last_seen_at))}</td>
        <td><button class="btn small" data-add="${i}">加入</button> <button class="btn small" data-skip="${i}">略過</button></td></tr>`).join('') || '<tr><td colspan="5">冇未配對名稱</td></tr>'}
      </tbody></table></div><div></div>`;
  panel.querySelectorAll('[data-add]').forEach((b) => {
    b.onclick = async () => {
      const u = rows[b.dataset.add];
      await api('admin/entities', { method: 'POST', body: { name_en: u.name, type: $(`ut${b.dataset.add}`).value } });
      toast('已加入'); renderUnmatched();
    };
  });
  panel.querySelectorAll('[data-skip]').forEach((b) => {
    b.onclick = async () => { await api(`admin/unmatched?name=${encodeURIComponent(rows[b.dataset.skip].name)}`, { method: 'DELETE' }); renderUnmatched(); };
  });
}

const RENDER = { jobs: renderJobs, sources: renderSources, tracked: () => renderTracked(), unmatched: renderUnmatched };

function show(t) {
  tab = t;
  page = 1;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  RENDER[t]().catch((e) => { panel.innerHTML = `<p class="bad">${esc(e.message)}</p>`; });
}

$('tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); };
panel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pg]');
  if (!b) return;
  page += Number(b.dataset.pg);
  RENDER[tab]();
});
api('admin/me').then((me) => { $('who').textContent = me.email; }).catch(() => {});
initTheme($('theme'));
show('jobs');
