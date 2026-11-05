// Admin: editions scan table, edition editor (details, prices + chart, returns, bottles, media, news), CSV import, settings.
import { esc, safeUrl, api, toast } from './common.js';
import { timeChart, signedBars, legend } from './charts.js';

const $ = (id) => document.getElementById(id);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const money = (minor, c = 'HKD') => (minor == null ? '—' : `${c === 'HKD' ? 'HK$' : c === 'USD' ? 'US$' : `${c} `}${Math.round(minor / 100).toLocaleString('en-US')}`);
const major = (minor) => (minor == null ? '' : String(minor / 100));
const pct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
const CURS = ['HKD', 'USD', 'GBP', 'EUR', 'JPY', 'CNY', 'SGD', 'TWD'];
const curOpts = (sel) => CURS.map((c) => `<option${c === sel ? ' selected' : ''}>${c}</option>`).join('');
const PRICE_TYPES = {
  auction_total: '拍賣成交（連佣金）', private_sale: '私人成交', auction_hammer: '拍賣落槌價', dealer_ask: '酒商叫價',
  msrp: '建議零售價', auction_unsold: '拍賣流拍',
};
const PT_ORDER = ['auction_total', 'private_sale', 'auction_hammer', 'dealer_ask', 'msrp'];
const STATUS = { scored: '已評分', insufficient_data: '資料不足', needs_review: '待核實' };
const PART_LABELS = [['trend', '趨勢', 30], ['activity', '活躍', 20], ['scarcity', '稀缺', 25], ['exit', '出場', 15], ['fundamentals', '基本面', 10]];

let entities = [];
let listState = { q: '', tier: '', sort: 'score', page: 1 };

// ---------- Scan table ----------
export async function renderEditions(panel) {
  if (!entities.length) entities = await api('admin/entities-all').catch(() => []);
  const p = new URLSearchParams({ q: listState.q, tier: listState.tier, sort: listState.sort, page: listState.page });
  const d = await api(`admin/editions?${p}`);
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const tierBadge = (s) => (s?.tier ? `<span class="tier tier-${s.tier}">${s.tier === 'low' ? '低' : s.tier}</span>` : '');
  panel.innerHTML = `
    <div class="toolbar">
      <div class="stat-row compact">
        <div class="stat"><div class="v">${d.summary.tracked}</div><div class="l">追蹤酒款</div></div>
        <div class="stat"><div class="v">${d.summary.scored}</div><div class="l">已評分</div></div>
        <div class="stat"><div class="v">${d.summary.insufficient}</div><div class="l">資料不足</div></div>
        <div class="stat"><div class="v">${d.summary.review}</div><div class="l">待核實</div></div>
      </div>
      <span style="flex:1"></span>
      <input class="field" id="eq" placeholder="搜尋酒款／酒廠" value="${esc(listState.q)}" style="max-width:200px">
      <select class="field" id="etier" style="width:auto">${['', 'A', 'B', 'C', 'low'].map((t) => `<option value="${t}"${t === listState.tier ? ' selected' : ''}>${t ? `Tier ${t === 'low' ? '低' : t}` : '所有 Tier'}</option>`).join('')}</select>
      <button class="btn" id="enew">新增酒款</button>
      <button class="btn" id="ecsv">CSV 匯入價格</button>
    </div>
    <div class="table-wrap"><table class="scan">
      <thead><tr><th>名稱</th><th>類別</th><th>Tier</th><th class="num">總分</th>
        ${PART_LABELS.map(([, l, mx]) => `<th class="num" title="滿分 ${mx}">${l}</th>`).join('')}
        <th class="num">最近成交</th><th class="num">12 個月</th><th>最近新聞</th></tr></thead>
      <tbody>${d.rows.map((r) => `<tr class="click" data-ed="${esc(r.id)}">
        <td>${esc(r.name_zh || r.name_en)}${r.is_demo ? ' <span class="tag">示範</span>' : ''}<div class="sub">${esc(r.distillery_zh || r.distillery_en || '')}</div></td>
        <td>${esc(r.category || '')}</td><td>${tierBadge(r.score)}</td>
        <td class="num"><b>${r.score?.status === 'scored' ? r.score.total : `<span class="sub">${STATUS[r.score?.status] || '未評分'}</span>`}</b></td>
        ${PART_LABELS.map(([k]) => `<td class="num">${r.score?.[k] ?? ''}</td>`).join('')}
        <td class="num">${money(r.lastSaleHkd)}</td>
        <td class="num ${r.change12 > 0 ? 'ok' : r.change12 < 0 ? 'bad' : ''}">${pct(r.change12)}</td>
        <td>${esc(day(r.lastNews))}</td></tr>`).join('') || '<tr><td colspan="13">未有酒款。可以撳「新增酒款」，或者去「設定」載入示範資料。</td></tr>'}
      </tbody></table></div>
    <div class="pager"><button class="btn small" data-epg="-1" ${listState.page <= 1 ? 'disabled' : ''}>上一頁</button>
      <span>${listState.page} / ${pages}</span><button class="btn small" data-epg="1" ${listState.page >= pages ? 'disabled' : ''}>下一頁</button></div>
    <p class="note">評分只作研究排序，並非買入建議。</p>`;
  let timer;
  $('eq').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { listState = { ...listState, q: e.target.value, page: 1 }; renderEditions(panel).then(() => { $('eq').focus(); }); }, 300); };
  $('etier').onchange = (e) => { listState = { ...listState, tier: e.target.value, page: 1 }; renderEditions(panel); };
  $('enew').onclick = () => openEditor(null, panel);
  $('ecsv').onclick = () => openCsv(panel);
  panel.querySelectorAll('[data-ed]').forEach((tr) => { tr.onclick = () => openEditor(tr.dataset.ed, panel); });
  panel.querySelectorAll('[data-epg]').forEach((b) => { b.onclick = () => { listState.page += Number(b.dataset.epg); renderEditions(panel); }; });
}

// ---------- Editor dialog ----------
function dialogShell(title) {
  let dlg = $('ed-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'ed-dialog';
    dlg.className = 'wide';
    document.body.append(dlg);
  }
  dlg.innerHTML = `<div class="dlg"><div class="dlg-head"><h2>${esc(title)}</h2><button class="close" type="button" id="ed-close" aria-label="Close">×</button></div>
    <div class="dlg-tabs" role="tablist" id="ed-tabs"></div><div class="dlg-body" id="ed-body"></div></div>`;
  $('ed-close').onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  return dlg;
}

async function openEditor(id, listPanel, tab = 'info') {
  const data = id ? await api(`admin/editions/${encodeURIComponent(id)}`) : null;
  const e = data?.edition || {};
  dialogShell(id ? (e.name_zh || e.name_en) : '新增酒款');
  const tabs = id ? [['info', '資料'], ['prices', '價格'], ['returns', '回報及投資卡'], ['ratings', '網上評分'], ['bottles', '單瓶'], ['media', '相片／證書'], ['news', '相關新聞']] : [['info', '資料']];
  $('ed-tabs').innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${k === tab}">${l}</button>`).join('');
  const reopen = (t) => openEditor(id, listPanel, t);
  const done = async (t) => { await renderEditions(listPanel); if (id) reopen(t); };
  const RENDER = {
    info: () => renderInfo(e, id, listPanel),
    prices: () => renderPrices(data, id, done),
    returns: () => renderReturns(data),
    ratings: () => renderRatings(data, id, done),
    bottles: () => renderBottles(data, id, done),
    media: () => renderMedia(data, id, done),
    news: () => renderNews(data),
  };
  $('ed-tabs').onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    $('ed-tabs').querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    RENDER[b.dataset.t]();
  };
  RENDER[tab]();
}

function entityOptions(type, sel) {
  return `<option value="">—</option>${entities.filter((x) => x.type === type).map((x) => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.name_zh ? `${x.name_zh} ${x.name_en}` : x.name_en)}</option>`).join('')}`;
}

function renderInfo(e, id, listPanel) {
  const f = (k, label, type = 'text', extra = '') => `<label>${label}<input class="field" name="${k}" type="${type}" value="${esc(e[k] ?? '')}" ${extra}></label>`;
  const ta = (k, label) => `<label class="full">${label}<textarea class="field" name="${k}" rows="3">${esc(e[k] ?? '')}</textarea></label>`;
  $('ed-body').innerHTML = `
    <details class="ai-draft"><summary>AI 起草（貼上英文描述，由 AI 填中英文介紹；數字只會由你貼嘅文字抽取）</summary>
      <textarea class="field" id="ai-text" rows="4" placeholder="Paste the English description here…"></textarea>
      <button class="btn small" type="button" id="ai-go">AI 起草</button> <span class="note">起草結果會填入下面表格，你檢查後再撳「儲存」。</span>
    </details>
    <form id="ed-form" class="grid-form">
      ${f('name_en', '英文名稱 *', 'text', 'required')}${f('name_zh', '中文名稱')}
      <label>酒廠<select class="field" name="distillery_id">${entityOptions('distillery', e.distillery_id)}</select></label>
      <label>品牌<select class="field" name="brand_id">${entityOptions('brand', e.brand_id)}</select></label>
      <label>獨立裝瓶商<select class="field" name="bottler_id">${entityOptions('bottler', e.bottler_id)}</select></label>
      ${f('category', '類別（用於重點名單分組）', 'text', 'list="cat-list"')}
      ${f('vintage_year', '蒸餾年份', 'number')}${f('bottling_year', '裝瓶年份', 'number')}${f('age_years', '酒齡', 'number')}
      ${f('cask_type', '桶型')}${f('cask_number', '桶號')}${f('edition_size', '限量瓶數', 'number')}
      ${f('abv', '酒精度 %', 'number', 'step="0.1"')}${f('volume_ml', '容量 ml', 'number')}${f('holding_months', '預計持有期（月）', 'number')}
      <label>目標價<span class="pair"><input class="field" name="target_price" value="${esc(major(e.target_price_minor))}" inputmode="decimal"><select class="field" name="target_currency">${curOpts(e.target_currency || 'HKD')}</select></span></label>
      <label>最低可接受出售價<span class="pair"><input class="field" name="floor_price" value="${esc(major(e.floor_price_minor))}" inputmode="decimal"><select class="field" name="floor_currency">${curOpts(e.floor_currency || 'HKD')}</select></span></label>
      ${ta('description_zh', '中文介紹')}${ta('description_en', 'English description')}
      ${ta('tasting_zh', '中文品飲筆記')}${ta('tasting_en', 'Tasting notes')}
      ${ta('owner_comment_zh', '專業評語（中）')}${ta('owner_comment_en', 'Professional comment (EN)')}
      <datalist id="cat-list"><option>closed_distillery</option><option>japanese</option><option>macallan</option><option>single_cask</option><option>scotland</option><option>bourbon</option></datalist>
      <div class="full form-actions">
        <button class="btn solid" type="submit">儲存</button>
        ${id ? '<button class="btn" type="button" id="ed-rescore">重算評分</button><span style="flex:1"></span><button class="btn danger" type="button" id="ed-del">刪除酒款</button>' : ''}
      </div>
    </form>`;
  $('ai-go').onclick = async () => {
    const btn = $('ai-go');
    btn.disabled = true; btn.textContent = '起草中…';
    try {
      const { draft } = await api('admin/ai-draft', { method: 'POST', body: { text: $('ai-text').value } });
      const form = $('ed-form');
      for (const [k, v] of Object.entries(draft)) if (v != null && form.elements[k] && !form.elements[k].value) form.elements[k].value = v;
      toast('已填入空白欄位，請檢查後儲存');
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.textContent = 'AI 起草';
  };
  $('ed-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const b = Object.fromEntries(new FormData(ev.target));
    try {
      const r = await api(id ? `admin/editions/${encodeURIComponent(id)}` : 'admin/editions', { method: id ? 'PATCH' : 'POST', body: b });
      toast('已儲存');
      await renderEditions(listPanel);
      openEditor(r.id, listPanel, 'info');
    } catch (err) { toast(err.message); }
  };
  if (id) {
    $('ed-rescore').onclick = async () => { await api(`admin/editions/${encodeURIComponent(id)}/rescore`, { method: 'POST' }); toast('已重算'); await renderEditions(listPanel); openEditor(id, listPanel, 'returns'); };
    $('ed-del').onclick = async () => {
      if (!window.confirm('確定刪除呢支酒款？價格、單瓶、相片會一併刪除，不能復原。')) return;
      await api(`admin/editions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      $('ed-dialog').close(); toast('已刪除'); renderEditions(listPanel);
    };
  }
}

let priceCurrency = 'HKD';

// Shortcuts that open other sites' search pages in a new tab for manual research. Nothing is fetched or
// copied by the system: Whisky Hunter's terms forbid commercial reuse of its prices, wsky1 says its data is
// "not licensed", so only sales the admin has checked are typed in here, with a source link.
function priceLookup(e) {
  const q = String(e.name_en || '').replace(/^\[Demo\]\s*/i, '').trim();
  const enc = encodeURIComponent(q);
  const links = [
    ['WhiskyAuction.com', `https://www.google.com/search?q=${encodeURIComponent(`site:whiskyauction.com ${q}`)}`],
    ['Whisky Hunter', `https://whiskyhunter.net/past/?search=${enc}`],
    ['wsky1', `https://www.google.com/search?q=${encodeURIComponent(`site:wsky1.com ${q}`)}`],
    ['Google 拍賣結果', `https://www.google.com/search?q=${encodeURIComponent(`"${q}" auction result`)}`],
  ];
  return `<div class="toolbar lookup"><span class="note">查價捷徑：</span>${links.map(([n, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)} ↗</a>`).join('')}
    <span class="note">只供你自己查閱。請只輸入你核實過嘅成交，並填返來源連結；唔好大量複製其他網站嘅數據（Whisky Hunter 條款禁止商業轉載）。</span></div>`;
}
function renderPrices(data, id, done) {
  const ps = data.prices;
  const valueOf = (p) => (priceCurrency === 'HKD' ? p.hkd_minor : priceCurrency === 'USD' ? p.usd_minor : p.amount_minor);
  const curLabel = (p) => (priceCurrency === 'orig' ? p.currency : priceCurrency);
  $('ed-body').innerHTML = `
    ${priceLookup(data.edition)}
    <div class="toolbar">
      <span class="note">幣種：</span>
      ${['HKD', 'USD', 'orig'].map((c) => `<button class="btn small${c === priceCurrency ? ' solid' : ''}" data-cur="${c}">${c === 'orig' ? '原幣' : c}</button>`).join('')}
      <span class="note">換算用成交當日或之前最近嘅匯率。</span>
    </div>
    <div class="viz-legend" id="pl"></div><div class="chart" id="pchart" style="height:220px"></div>
    <form id="p-form" class="inline">
      <select class="field" name="price_type">${Object.entries(PRICE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input class="field" name="amount" placeholder="金額" inputmode="decimal" style="max-width:120px">
      <select class="field" name="currency" style="max-width:90px">${curOpts('HKD')}</select>
      <input class="field" name="observed_at" type="date" required style="max-width:150px">
      <input class="field" name="venue" placeholder="拍賣行／酒商">
      <input class="field" name="lot_number" placeholder="Lot" style="max-width:80px">
      <input class="field" name="volume_ml" placeholder="ml" style="max-width:70px">
      <label class="chk"><input type="checkbox" name="is_public" value="1"> 公開</label>
      <button class="btn solid">新增價格</button>
    </form>
    <div class="table-wrap"><table><thead><tr><th>日期</th><th>類型</th><th class="num">金額</th><th>拍賣行／酒商</th><th>Lot</th><th>公開</th><th></th></tr></thead>
      <tbody>${[...ps].reverse().map((p) => `<tr><td>${esc(day(p.observed_at))}</td><td>${esc(PRICE_TYPES[p.price_type] || p.price_type)}</td>
        <td class="num">${money(valueOf(p), curLabel(p))}</td><td>${esc(p.venue || '')}${p.source_url ? ` <a href="${safeUrl(p.source_url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</td>
        <td>${esc(p.lot_number || '')}</td><td><input type="checkbox" class="switch" data-ppub="${esc(p.id)}" ${p.is_public ? 'checked' : ''} aria-label="公開"></td>
        <td><button class="btn small" data-pdel="${esc(p.id)}">刪除</button></td></tr>`).join('') || '<tr><td colspan="7">未有價格紀錄</td></tr>'}</tbody></table></div>`;
  const series = PT_ORDER.map((k, i) => ({
    name: PRICE_TYPES[k], color: css(`--s${i + 1}`), line: k !== 'dealer_ask' && k !== 'msrp',
    points: ps.filter((p) => p.price_type === k && valueOf(p) != null).map((p) => ({ t: Date.parse(p.observed_at), y: valueOf(p) / 100, label: p.venue || '' })),
  })).filter((s) => s.points.length);
  legend($('pl'), series);
  const mixed = priceCurrency === 'orig' && new Set(ps.map((p) => p.currency)).size > 1;
  if (mixed) $('pchart').innerHTML = '<p class="note">原幣有多種貨幣，圖表請揀 HKD 或 USD。</p>';
  else timeChart($('pchart'), series, { fmt: (v) => Math.round(v).toLocaleString('en-US'), height: 220, ariaLabel: '價格歷史' });
  $('ed-body').querySelectorAll('[data-cur]').forEach((b) => { b.onclick = () => { priceCurrency = b.dataset.cur; renderPrices(data, id, done); }; });
  $('p-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api(`admin/editions/${encodeURIComponent(id)}/prices`, { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) });
      toast('已新增，評分已重算'); done('prices');
    } catch (err) { toast(err.message); }
  };
  $('ed-body').querySelectorAll('[data-pdel]').forEach((b) => { b.onclick = async () => { if (!window.confirm('刪除呢筆價格？')) return; await api(`admin/prices/${encodeURIComponent(b.dataset.pdel)}`, { method: 'DELETE' }); done('prices'); }; });
  $('ed-body').querySelectorAll('[data-ppub]').forEach((c) => { c.onchange = () => api(`admin/prices/${encodeURIComponent(c.dataset.ppub)}`, { method: 'PATCH', body: { is_public: c.checked } }).then(() => toast(c.checked ? '已設為公開' : '已設為私人')); });
}

// Holding-period returns: buy at the median sold price of year Y, sell at the last-12-month median, minus exit cost.
export function returnsByStartYear(prices, exitPct) {
  const sold = prices.filter((p) => (p.price_type === 'auction_total' || p.price_type === 'private_sale') && p.hkd_minor != null)
    .map((p) => ({ t: Date.parse(p.observed_at), v: p.hkd_minor }));
  if (sold.length < 2) return [];
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const now = Date.now();
  const recent = sold.filter((s) => s.t >= now - 365 * 86400_000).map((s) => s.v);
  if (!recent.length) return [];
  const sell = med(recent) * (1 - exitPct / 100);
  const thisYear = new Date().getUTCFullYear();
  const out = [];
  for (let y = thisYear - 10; y <= thisYear - 1; y++) {
    const inYear = sold.filter((s) => new Date(s.t).getUTCFullYear() === y).map((s) => s.v);
    if (!inYear.length) continue;
    const buy = med(inYear);
    const years = (now - Date.UTC(y, 6, 1)) / (365.25 * 86400_000);
    out.push({ label: String(y), value: (sell / buy) ** (1 / years) - 1, note: `買入 ${money(buy)} → 賣出（扣出場成本）${money(sell)}，約 ${years.toFixed(1)} 年` });
  }
  return out;
}

function renderReturns(data) {
  const s = data.score;
  const c = data.card;
  const exitPct = (() => { try { return JSON.parse(s?.inputs_json || '{}').exitCostPct ?? 15; } catch { return 15; } })();
  const rows = returnsByStartYear(data.prices, exitPct);
  const part = (k, l, mx) => `<div class="part"><span>${l}</span><div class="bar"><i style="width:${s?.[k] != null ? (s[k] / mx) * 100 : 0}%"></i></div><b>${s?.[k] ?? '—'}</b><span class="sub">/ ${mx}</span></div>`;
  $('ed-body').innerHTML = `
    <div class="two">
      <div class="chart-card">
        <h3>評分</h3>
        ${s?.status === 'scored'
    ? `<div class="score-head"><span class="tier tier-${s.tier}">${s.tier === 'low' ? '低' : s.tier}</span><b class="big">${s.total}</b><span class="sub">/ 100</span></div>${PART_LABELS.map(([k, l, mx]) => part(k, l, mx)).join('')}`
    : `<p>${esc(STATUS[s?.status] || '未評分')}${s?.status === 'insufficient_data' ? '：過去 24 個月同版本成交少於 3 次，唔計總分。' : s?.status === 'needs_review' ? '：欠裝瓶年份而又有同名版本，或價格容量同版本唔一致。' : ''}</p>`}
        <p class="note">評分只作研究排序，並非買入建議。最近計算：${esc(day(s?.computed_at))}</p>
        <h3 style="margin-top:12px">投資卡</h3>
        <dl class="kv">
          <dt>參考買入價</dt><dd>${money(c?.buyRef)}${c ? `（樣本 ${c.sample}）` : ''}</dd>
          <dt>目標價</dt><dd>${money(c?.target)}</dd>
          <dt>最低可接受出售價</dt><dd>${money(c?.floor)}</dd>
          <dt>出場成本</dt><dd>${money(c?.exitCost)}（${exitPct}%）</dd>
          <dt>預計持有期</dt><dd>${c?.holdingMonths ? `${c.holdingMonths} 個月` : '—'}</dd>
          <dt>回報風險比 RRR</dt><dd><b>${c?.rrr ?? '未能計算'}</b></dd>
        </dl>
      </div>
      <div class="chart-card">
        <h3>持有回報：如果喺某年買入，今日賣出（年化，已扣出場成本）</h3>
        <div class="chart" id="rchart" style="height:240px"></div>
        <p class="note">買入價＝嗰年成交中位數；賣出價＝近 12 個月成交中位數 × (1 − ${exitPct}%)。過往表現不代表將來，並非投資建議。</p>
      </div>
    </div>`;
  if (rows.length) signedBars($('rchart'), rows, { fmt: (v) => `${(v * 100).toFixed(1)}%`, height: 240, ariaLabel: '持有回報' });
  else $('rchart').innerHTML = '<p class="note">需要最少兩年唔同年份嘅成交，加上近 12 個月有成交，先計到回報。</p>';
}

const RATING_SOURCES = [['Whiskybase', 100], ['Whisky Advocate', 100], ['Whiskyfun', 100], ['Distiller', 100], ['Whisky Bible (Jim Murray)', 100],
  ['Whisky Magazine', 10], ['IWSC', 100], ['San Francisco World Spirits Competition', 100], ['World Whiskies Awards', 100]];

function renderRatings(data, id, done) {
  const r = data.ratings || [];
  $('ed-body').innerHTML = `
    <p class="note">喺網上搵到嘅評分或者獎項，連埋來源連結一齊記低，前台會同我哋自己嘅評分並排顯示。為免違反網站條款，系統唔會自動抓取（例如 Whiskybase 唔准程式讀取），請你自己輸入。</p>
    <form id="r-form" class="inline">
      <input class="field" name="source" list="r-sources" placeholder="來源，例如 Whiskybase" required>
      <datalist id="r-sources">${RATING_SOURCES.map(([n]) => `<option>${esc(n)}</option>`).join('')}</datalist>
      <input class="field" name="score" placeholder="分數" inputmode="decimal" style="max-width:80px">
      <input class="field" name="scale" placeholder="滿分" value="100" inputmode="decimal" style="max-width:70px">
      <input class="field" name="votes" placeholder="評分人數" inputmode="numeric" style="max-width:100px">
      <input class="field" name="award" placeholder="獎項（可留空）" style="max-width:130px">
      <input class="field" name="url" type="url" placeholder="來源連結 https://…">
      <input class="field" name="rated_at" type="date" style="max-width:150px">
      <button class="btn solid">新增</button>
    </form>
    <div class="table-wrap"><table><thead><tr><th>來源</th><th class="num">分數</th><th class="num">人數</th><th>獎項</th><th>查閱日期</th><th>公開</th><th></th></tr></thead>
      <tbody>${r.map((x) => `<tr><td>${x.url ? `<a href="${safeUrl(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.source)} ↗</a>` : esc(x.source)}</td>
        <td class="num">${x.score != null ? `${x.score} / ${x.scale}` : '—'}</td><td class="num">${x.votes ?? ''}</td><td>${esc(x.award || '')}</td><td>${esc(x.rated_at || '')}</td>
        <td><input type="checkbox" class="switch" data-rpub="${esc(x.id)}" ${x.is_public ? 'checked' : ''} aria-label="公開"></td>
        <td><button class="btn small" data-rdel="${esc(x.id)}">刪除</button></td></tr>`).join('') || '<tr><td colspan="7">未有網上評分</td></tr>'}</tbody></table></div>`;
  const form = $('r-form');
  form.elements.source.oninput = () => {
    const hit = RATING_SOURCES.find(([n]) => n === form.elements.source.value);
    if (hit) form.elements.scale.value = hit[1];
  };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api(`admin/editions/${encodeURIComponent(id)}/ratings`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast('已新增'); done('ratings'); } catch (err) { toast(err.message); }
  };
  $('ed-body').querySelectorAll('[data-rpub]').forEach((c) => { c.onchange = () => api(`admin/ratings/${encodeURIComponent(c.dataset.rpub)}`, { method: 'PATCH', body: { is_public: c.checked } }).then(() => toast(c.checked ? '已設為公開' : '已設為私人')); });
  $('ed-body').querySelectorAll('[data-rdel]').forEach((b) => { b.onclick = async () => { if (!window.confirm('刪除呢個評分？')) return; await api(`admin/ratings/${encodeURIComponent(b.dataset.rdel)}`, { method: 'DELETE' }); done('ratings'); }; });
}

function renderBottles(data, id, done) {
  const b = data.bottles;
  const form = (x = {}) => `
    <form class="grid-form bottle-form" data-bid="${esc(x.id || '')}">
      <label>瓶號<input class="field" name="bottle_number" value="${esc(x.bottle_number ?? '')}" placeholder="例：18/120"></label>
      <label>酒位<input class="field" name="fill_level" value="${esc(x.fill_level ?? '')}" placeholder="例：into neck"></label>
      <label>封口<input class="field" name="seal_condition" value="${esc(x.seal_condition ?? '')}"></label>
      <label>酒標<input class="field" name="label_condition" value="${esc(x.label_condition ?? '')}"></label>
      <label class="chk"><input type="checkbox" name="has_box" value="1" ${x.has_box ? 'checked' : ''}> 有盒</label>
      <label>盒況<input class="field" name="box_condition" value="${esc(x.box_condition ?? '')}"></label>
      <label>購入年份<input class="field" name="acquired_year" type="number" value="${esc(x.acquired_year ?? '')}"></label>
      <label>購入成本（永不公開）<span class="pair"><input class="field" name="cost" value="${esc(major(x.cost_minor))}" inputmode="decimal"><select class="field" name="cost_currency">${curOpts(x.cost_currency || 'HKD')}</select></span></label>
      <label class="full">來源證明備註（私人）<input class="field" name="provenance_note" value="${esc(x.provenance_note ?? '')}"></label>
      <label class="full">私人備註（永不公開）<input class="field" name="private_note" value="${esc(x.private_note ?? '')}"></label>
      <div class="full form-actions"><button class="btn solid">${x.id ? '儲存單瓶' : '新增單瓶'}</button>${x.id ? `<button class="btn danger" type="button" data-bdel="${esc(x.id)}">刪除</button>` : ''}</div>
    </form>`;
  $('ed-body').innerHTML = `<p class="note">每支實際單瓶可以記低瓶況同成本。成本同私人備註只限後台，分享頁永遠唔會顯示。</p>
    ${b.map((x) => `<details class="bottle"><summary>${esc(x.bottle_number || '單瓶')} · ${esc(x.fill_level || '')}${x.cost_minor != null ? ` · 成本 ${money(x.cost_minor, x.cost_currency)}` : ''}</summary>${form(x)}</details>`).join('')}
    <details class="bottle" ${b.length ? '' : 'open'}><summary>＋ 新增單瓶</summary>${form()}</details>`;
  $('ed-body').querySelectorAll('.bottle-form').forEach((f) => {
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      body.has_box = !!body.has_box;
      const bid = f.dataset.bid;
      await api(bid ? `admin/bottles/${encodeURIComponent(bid)}` : `admin/editions/${encodeURIComponent(id)}/bottles`, { method: bid ? 'PATCH' : 'POST', body });
      toast('已儲存'); done('bottles');
    };
  });
  $('ed-body').querySelectorAll('[data-bdel]').forEach((x) => { x.onclick = async () => { if (!window.confirm('刪除呢支單瓶？')) return; await api(`admin/bottles/${encodeURIComponent(x.dataset.bdel)}`, { method: 'DELETE' }); done('bottles'); }; });
}

function renderMedia(data, id, done) {
  $('ed-body').innerHTML = `
    <p class="note warn">⚠ 證書或相片唔代表已驗證真偽。每張預設唔公開，要逐張打剔先會喺分享頁顯示。</p>
    <form id="m-form" class="inline">
      <input class="field" type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>
      <select class="field" name="kind" style="max-width:120px"><option value="photo">相片</option><option value="certificate">證書</option><option value="receipt">單據</option></select>
      <input class="field" name="caption" placeholder="說明（可留空）">
      <button class="btn solid">上載</button>
    </form>
    <div class="media-grid">${data.media.map((m) => `<figure>
      ${m.content_type?.startsWith('image/') ? `<img src="/api/admin/media/${esc(m.id)}" alt="${esc(m.caption || '')}" loading="lazy">` : `<a class="pdf" href="/api/admin/media/${esc(m.id)}" target="_blank" rel="noopener">PDF</a>`}
      <figcaption>${esc({ photo: '相片', certificate: '證書', receipt: '單據' }[m.kind] || m.kind)} ${esc(m.caption || '')}
        <label class="chk"><input type="checkbox" data-mpub="${esc(m.id)}" ${m.is_public ? 'checked' : ''}> 公開</label>
        <button class="btn small" data-mdel="${esc(m.id)}">刪除</button></figcaption></figure>`).join('') || '<p class="note">未有相片</p>'}</div>`;
  $('m-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const res = await fetch(`/api/admin/editions/${encodeURIComponent(id)}/media`, { method: 'POST', body: new FormData(ev.target) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error || '上載失敗'); return; }
    toast('已上載'); done('media');
  };
  $('ed-body').querySelectorAll('[data-mpub]').forEach((c) => { c.onchange = () => api(`admin/media/${encodeURIComponent(c.dataset.mpub)}`, { method: 'PATCH', body: { is_public: c.checked } }).then(() => toast(c.checked ? '已設為公開' : '已設為私人')); });
  $('ed-body').querySelectorAll('[data-mdel]').forEach((b) => { b.onclick = async () => { if (!window.confirm('刪除呢個檔案？')) return; await api(`admin/media/${encodeURIComponent(b.dataset.mdel)}`, { method: 'DELETE' }); done('media'); }; });
}

function renderNews(data) {
  $('ed-body').innerHTML = data.news.length
    ? `<div class="table-wrap"><table><thead><tr><th>日期</th><th>標題</th><th>類別</th></tr></thead><tbody>${data.news.map((n) => `<tr>
      <td>${esc(day(n.d))}</td><td>${esc(n.title_zh || n.title_en)}${n.investor_focus ? ' <span class="badge">投資者焦點</span>' : ''}</td><td>${esc(n.category || '')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="note">未有連到呢支酒嘅酒廠／品牌嘅新聞。喺「資料」揀返酒廠或品牌，新聞就會自動連上。</p>';
}

// ---------- CSV import ----------
const CSV_TEMPLATE = 'edition_slug,price_type,amount,currency,observed_at,market,venue,lot_number,condition_note,source_url,volume_ml,is_public\n'
  + 'demo-1,auction_total,125000,HKD,2026-10-01,HK,Example Auction House,123,top shoulder,,700,yes\n';

function openCsv(listPanel) {
  dialogShell('CSV 匯入價格');
  $('ed-tabs').innerHTML = '';
  $('ed-body').innerHTML = `
    <p class="note">欄位同價格表一樣。<a href="data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}" download="whiskytoday-prices-template.csv">下載範本</a>。
      edition_slug 喺酒款資料入面搵到；price_type 用：auction_total、private_sale、auction_hammer、dealer_ask、msrp、auction_unsold；日期格式 YYYY-MM-DD。</p>
    <input class="field" type="file" id="csv-file" accept=".csv,text/csv">
    <textarea class="field" id="csv-text" rows="6" placeholder="或者直接貼上 CSV 內容"></textarea>
    <div class="form-actions"><button class="btn" id="csv-preview">預覽</button><button class="btn solid" id="csv-commit" disabled>匯入正確嘅行</button></div>
    <div id="csv-out"></div>`;
  $('csv-file').onchange = async (ev) => { const f = ev.target.files[0]; if (f) $('csv-text').value = await f.text(); };
  const run = async (commit) => {
    try {
      const r = await api('admin/prices/import', { method: 'POST', body: { csv: $('csv-text').value, commit } });
      $('csv-commit').disabled = commit || !r.ok;
      $('csv-out').innerHTML = `<p>${commit ? '已匯入' : '預覽'}：<b class="ok">${r.ok} 行正確</b>，<b class="bad">${r.bad} 行有錯（唔會匯入）</b></p>
        <div class="table-wrap"><table><thead><tr><th>行</th><th>酒款</th><th>類型</th><th class="num">金額</th><th>幣種</th><th>日期</th><th>錯誤欄位</th></tr></thead>
        <tbody>${r.rows.slice(0, 200).map((x) => `<tr class="${x.errors.length ? 'row-bad' : ''}"><td>${x.line}</td><td>${esc(x.input.edition_slug)}</td><td>${esc(x.input.price_type)}</td>
          <td class="num">${esc(x.input.amount)}</td><td>${esc(x.input.currency)}</td><td>${esc(x.input.observed_at)}</td><td class="bad">${esc(x.errors.join(', '))}</td></tr>`).join('')}</tbody></table></div>`;
      if (commit) { toast('匯入完成，評分已重算'); renderEditions(listPanel); }
    } catch (err) { $('csv-out').innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
  };
  $('csv-preview').onclick = () => run(false);
  $('csv-commit').onclick = () => run(true);
}

// ---------- Settings ----------
export async function renderSettings(panel) {
  const s = await api('admin/settings');
  let w = { trend: 30, activity: 20, scarcity: 25, exit: 15, fundamentals: 10 };
  try { w = { ...w, ...JSON.parse(s.score_weights || '{}') }; } catch { /* default */ }
  panel.innerHTML = `
    <form id="set-form" class="grid-form" style="max-width:720px">
      <label>預設顯示幣種<select class="field" name="default_currency">${['HKD', 'USD'].map((c) => `<option${c === s.default_currency ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>出場成本（賣方佣金＋運費＋保險，%）<input class="field" name="exit_cost_pct" type="number" step="0.5" value="${esc(s.exit_cost_pct || 15)}"></label>
      <fieldset class="full"><legend>評分權重（加埋要等於 100）</legend>
        ${PART_LABELS.map(([k, l]) => `<label>${l}<input class="field" name="w_${k}" type="number" value="${w[k]}"></label>`).join('')}
      </fieldset>
      <div class="full form-actions"><button class="btn solid">儲存並重算所有評分</button></div>
    </form>
    <h3 style="margin-top:18px">示範資料</h3>
    <p class="note">載入約 10 支虛構示範酒款（名稱有「示範」字樣），即刻睇到評分表、價格圖同回報圖效果。示範資料唔會冒充真實成交。</p>
    <div class="form-actions"><button class="btn" id="demo-load">載入示範資料</button><button class="btn danger" id="demo-clear">清除示範資料</button></div>`;
  $('set-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const score_weights = Object.fromEntries(PART_LABELS.map(([k]) => [k, Number(fd[`w_${k}`])]));
    try { await api('admin/settings', { method: 'PATCH', body: { default_currency: fd.default_currency, exit_cost_pct: fd.exit_cost_pct, score_weights } }); toast('已儲存，評分已重算'); } catch (err) { toast(err.message); }
  };
  $('demo-load').onclick = async () => { await api('admin/demo', { method: 'POST' }); toast('已載入示範資料'); };
  $('demo-clear').onclick = async () => { if (!window.confirm('清除所有示範酒款同價格？')) return; await api('admin/demo', { method: 'DELETE' }); toast('已清除'); };
}
