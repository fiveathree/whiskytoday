// Shared helpers: escaping, i18n, API calls.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only allow http(s) links from external data.
export const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');

const STR = {
  'nav.news': ['每日情報', 'Intelligence'],
  'nav.admin': ['後台', 'Admin'],
  'nav.calc': ['計算器', 'Calculator'],
  'nav.trends': ['市場趨勢', 'Trends'],
  'nav.whisky': ['酒款', 'Collection'],
  'calc.title': ['進口成本計算器', 'Import Cost Calculator'], 'calc.showGbp': ['顯示含稅價（GBP）', 'Show incl. tax (GBP)'],
  'calc.reset': ['全部回復預設', 'Reset all'], 'calc.csv': ['下載 CSV', 'Download CSV'], 'calc.print': ['列印', 'Print'],
  'calc.note': ['即計即用，唔會儲存；重新整理會回到預設值。', 'Nothing is saved; refreshing the page restores the defaults.'],
  'title.whisky': ['精選酒款', 'Collection'], 'search.whisky': ['搜尋酒款或酒廠…', 'Search bottlings or distilleries…'],
  'f.tier': ['評級', 'Tier'], 'tier.A': ['A級', 'Tier A'], 'tier.B': ['B級', 'Tier B'], 'tier.C': ['C級', 'Tier C'], 'w.items': ['款', 'bottlings'], 'w.last': ['最近公開成交', 'Last public sale'],
  'w.demo': ['示範', 'Demo'], 'w.empty': ['暫時未有酒款', 'No bottlings yet'],
  'w.overview': ['概覽', 'Overview'], 'w.prices': ['價格', 'Prices'], 'w.news': ['相關消息', 'Related news'],
  'w.distillery': ['酒廠', 'Distillery'], 'w.age': ['酒齡', 'Age'], 'w.vintage': ['蒸餾年份', 'Vintage'], 'w.bottled': ['裝瓶年份', 'Bottled'],
  'w.cask': ['桶', 'Cask'], 'w.size': ['限量', 'Edition size'], 'w.abv': ['酒精度', 'ABV'], 'w.volume': ['容量', 'Volume'],
  'w.ours': ['Whisky Today 評級', 'Whisky Today rating'], 'w.votes': ['人評分', 'ratings'], 'w.checked': ['查閱於', 'checked'],
  'w.scoreNote': ['我哋嘅評級按價格趨勢、成交、稀缺度、出場難度及酒廠消息計算，只作研究排序；網上評分來自各來源網站，以原網站為準。', 'Our rating ranks bottlings by price trend, liquidity, scarcity, exit and distillery news, for research only. Online ratings belong to their sources.'],
  'w.tasting': ['品飲筆記', 'Tasting notes'], 'w.comment': ['專業評語', 'Professional comment'],
  'w.doc': ['文件', 'Document'], 'w.authNote': ['相片及證書不代表已驗證真偽。', 'Photos and certificates do not verify authenticity.'],
  'w.fxNote': ['以成交當日或之前最近嘅匯率換算。', 'Converted at the rate on or before each sale date.'],
  'w.date': ['日期', 'Date'], 'w.type': ['類型', 'Type'], 'w.amount': ['金額', 'Amount'], 'w.venue': ['拍賣行／酒商', 'Venue'],
  'w.noPrices': ['暫時未有公開價格紀錄。', 'No public price records yet.'], 'w.noNews': ['暫時未有相關消息。', 'No related news yet.'],
  'st.insufficient_data': ['資料不足', 'Insufficient data'], 'st.needs_review': ['待核實', 'Under review'], 'st.none': ['未評級', 'Not rated'],
  'title.trends': ['市場趨勢', 'Market Trends'],
  'print': ['列印 / PDF', 'Print / PDF'],
  't.exports': ['整體出口', 'Exports'], 't.markets': ['亞洲及主要市場', 'Asia & key markets'], 't.news': ['市場消息', 'Market news'],
  'c.total': ['蘇格蘭威士忌出口值（滾動 12 個月總和）', 'Scotch whisky exports (rolling 12-month total)'],
  'c.asia': ['亞洲市場出口值（滾動 12 個月）', 'Exports to Asian markets (rolling 12 months)'],
  'c.top': ['十二大出口市場（近 12 個月，按年變化）', 'Top 12 export markets (last 12 months, YoY)'],
  'c.cats': ['每月新聞類別', 'News by category per month'],
  'c.sent': ['投資者焦點：利好 vs 利淡（每月）', 'Investor focus: bullish vs bearish (monthly)'],
  'c.ent': ['近 180 日最多投資者焦點消息嘅酒廠／品牌', 'Most-covered distilleries / brands (180 days)'],
  'seg.all': ['全部蘇格蘭威士忌', 'All Scotch whisky'], 'seg.sm': ['單一麥芽', 'Single malt'],
  'k.total': ['近 12 個月出口總值', 'Exports, last 12 months'], 'k.sm': ['單一麥芽（近 12 個月）', 'Single malt, last 12 months'],
  'k.yoy': ['按年', 'YoY'], 'k.share': ['佔比', 'Share'], 'k.latest': ['最新數據', 'Latest data'],
  'k.lag': ['英國海關約 6 星期後公佈', 'HMRC publishes ~6 weeks later'],
  'g.auction': ['拍賣／紀錄價', 'Auctions / records'], 'g.closure': ['停產／復廠', 'Closures / reopenings'],
  'g.deal': ['收購／稅項／市場', 'Deals / tax / market'], 'g.release': ['新品／限量', 'Releases'], 'g.other': ['其他', 'Other'],
  'accumulating': ['新聞數據由 2026 年 11 月開始累積，圖表會隨時間變得完整。', 'News data started in Nov 2026; this chart fills in over time.'],
  'source': ['資料來源', 'Source'],
  'sent.sumPrefix': ['以上期間按新聞計（每則只計一次）：', 'Over this period, counted per article:'],
  'sent.none': ['AI 未判斷', 'no AI direction'],
  'ent.how': ['按酒廠／品牌計：一則新聞提到幾間，就每間各計一次；方向係 AI 對嗰間嘅判斷，所以總數同上面圖表唔會一樣。撳入可以睇返係邊幾則新聞。', 'Counted per distillery/brand: an article naming several counts once for each, with the AI direction for that name, so totals differ from the chart above. Click to see the articles.'],
  'ent.view': ['睇新聞', 'View'], 'ent.dlg': ['近 180 日投資者焦點新聞', 'Investor-focus news, last 180 days'],
  'ent.analysis': ['睇完整分析', 'Full analysis'], 'ent.source': ['原文', 'Original'], 'ent.none': ['暫時未有相關消息。', 'No related news yet.'],
  'rules.title': ['利好／利淡點樣分？', 'How are bullish / bearish decided?'],
  'rules.html': ["<h4>邊啲新聞係「投資者焦點」：由程式規則決定，唔係 AI</h4><p>新聞類別屬拍賣、紀錄價、停產／閉廠、復廠、收購、限量發售、市場指數、稅項／法規、匯率／貿易、假酒／撤拍其中之一；或者重要性 4–5 分而又提到你追蹤緊嘅酒廠／品牌。類別同重要性（1–5）由 AI 讀標題同摘要後判斷。</p><h4>利好／利淡／中性：由 AI 判斷</h4><p>AI 只根據新聞標題同摘要，判斷呢則新聞會唔會影響收藏級威士忌喺二手市場嘅價格，分兩層：</p><ul><li><b>整則新聞嘅方向</b>（利好／利淡／中性）→ 用喺上面每月圖表，每則新聞只計一次；AI 冇俾方向嘅列為「AI 未判斷」。</li><li><b>每間受影響酒廠／品牌嘅方向</b>（利好 +1／中性 0／利淡 −1）→ 用喺下面清單，同埋酒款評分嘅「酒廠基本面」。同一則新聞可以對唔同酒廠有唔同方向，例如甲收購乙。</li></ul><p>例：閉廠、限量減少、紀錄成交價通常判利好（存貨更稀少、市場熱）；加稅、關稅、假酒、需求下跌通常判利淡。AI 要同時寫出證據同推論，可以喺每則新聞嘅「投資者分析」分頁睇返。</p><h4>注意</h4><p>呢個係 AI 對新聞嘅解讀，並非事實或投資建議；只反映有報道嘅消息，數量少嘅時候參考價值有限。</p>", "<h4>Which news is “investor focus”: a fixed rule, not the AI</h4><p>Category is auction, record price, closure, reopening, acquisition, limited release, market index, tax/regulation, FX/trade or counterfeit; or importance 4–5 and it names a distillery/brand you track. The AI assigns category and importance (1–5) from the headline and summary.</p><h4>Bullish / bearish / neutral: the AI decides</h4><p>From the headline and summary only, the AI judges whether the news could move secondary-market prices of collectible whisky, at two levels:</p><ul><li><b>The article overall</b> → the monthly chart, one count per article; items with no AI direction are shown separately.</li><li><b>Each affected distillery/brand</b> (+1 / 0 / −1) → the list below and the “fundamentals” part of bottle scores. One article can be bullish for one name and bearish for another.</li></ul><p>Typical: closures, smaller releases and record prices lean bullish; new taxes, tariffs, fakes and falling demand lean bearish. The AI must give evidence and reasoning, shown in each article’s investor tab.</p><h4>Note</h4><p>This is the AI’s reading of the news, not fact or advice, and only covers reported news.</p>"],
  'disclaimer.full': ['本頁資料僅供市場參考，並非投資建議，不保證任何成交價或回報。', 'For market reference only. Not investment advice; no price or return is guaranteed.'],
  'collect': ['立即收集新聞', 'Collect now'],
  'collecting': ['收集中…約 3–5 分鐘，請勿關閉', 'Collecting… 3–5 min, keep open'],
  'collect.done': ['收集完成', 'Collection finished'],
  'collect.fail': ['未完成：', 'Not finished: '],
  'collect.feeds': ['讀取新聞來源中…', 'Reading sources…'], 'collect.ai': ['AI 整理中', 'AI processing'],
  'collect.new': ['新文章', 'new'], 'collect.processed': ['已整理', 'processed'], 'collect.left': ['仲有排隊', 'still queued'],
  'f.view': ['檢視', 'View'], 'f.region': ['地區', 'Region'], 'f.category': ['類別', 'Category'], 'f.date': ['日期', 'Date'],
  'view.all': ['全部', 'All'], 'view.investor': ['投資者焦點', 'Investor focus'],
  'title.news': ['每日全球情報', 'Global Daily Intelligence'],
  'search': ['搜尋新聞…', 'Search news…'],
  'prev': ['上一頁', 'Previous'], 'next': ['下一頁', 'Next'],
  'tab.summary': ['摘要', 'Summary'], 'tab.investor': ['投資者分析', 'Investor card'], 'tab.sources': ['來源', 'Sources'],
  'any': ['全部', 'All'], 'any.region': ['所有地區', 'All regions'], 'any.category': ['所有類別', 'All categories'],
  'items': ['則', 'items'],
  'page': ['頁', 'page'],
  'empty': ['暫時未有符合條件的消息', 'No news matches these filters'],
  'facts': ['事實', 'Facts'], 'claims': ['來源說法（未證實）', 'Source claims (unverified)'],
  'ai': ['AI 解讀', 'AI interpretation'],
  'ai.note': ['以下為 AI 推論，並非事實或投資建議。', 'AI inference, not fact or investment advice.'],
  'focus': ['投資者焦點', 'Investor focus'],
  'sources.n': ['個來源', 'sources'],
  'no.card': ['此新聞不屬投資者焦點。', 'Not an investor-focus item.'],
  'dir': ['方向', 'Direction'], 'horizon': ['影響期', 'Horizon'], 'affected': ['受影響', 'Affected'],
  'evidence': ['證據', 'Evidence'], 'reasoning': ['AI 推論', 'AI reasoning'], 'watch': ['之後留意', 'Watch next'],
  'short': ['短期', 'Short term'], 'long': ['長期', 'Long term'],
  'bullish': ['利好', 'Bullish'], 'bearish': ['利淡', 'Bearish'], 'neutral': ['中性', 'Neutral'],
  'entities': ['相關酒廠／品牌', 'Related distilleries / brands'],
  'disclaimer': ['內容由 AI 整理，僅供市場參考，並非投資建議。', 'AI-assisted summary for market reference only. Not investment advice.'],
  'loading': ['載入中…', 'Loading…'],
  'error': ['載入失敗，請重新整理。', 'Failed to load. Please refresh.'],
};

export const REGION = {
  scotland: ['蘇格蘭', 'Scotland'], japan: ['日本', 'Japan'], usa: ['美國', 'USA'], taiwan: ['台灣', 'Taiwan'],
  hk_china: ['香港／中國', 'HK / China'], ireland: ['愛爾蘭', 'Ireland'], other: ['全球／其他', 'Global / other'],
};

export const CATEGORY = {
  auction: ['拍賣', 'Auction'], record_price: ['紀錄價', 'Record price'], distillery_closure: ['停產／閉廠', 'Closure'],
  distillery_reopen: ['復廠', 'Reopening'], acquisition: ['收購', 'Acquisition'], limited_release: ['限量發售', 'Limited release'],
  new_release: ['新品', 'New release'], market_index: ['市場指數', 'Market index'], regulation_tax: ['稅項／法規', 'Tax / regulation'],
  fx_trade: ['匯率／貿易', 'FX / trade'], counterfeit: ['假酒／撤拍', 'Counterfeit'], industry: ['業界', 'Industry'],
  education_history: ['知識／歷史', 'Education'], event: ['活動', 'Event'],
};

let lang = 'zh';
try { lang = localStorage.getItem('wt-lang') === 'en' ? 'en' : 'zh'; } catch { /* storage blocked */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('wt-lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant';
}
export const t = (k) => (STR[k] ? STR[k][lang === 'en' ? 1 : 0] : k);
export const pick = (pair) => (pair ? pair[lang === 'en' ? 1 : 0] : '');

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
}

// Dark / light theme toggle; the choice is remembered per browser (set early by an inline script in <head>).
export function initTheme(btn) {
  const show = () => {
    const light = document.documentElement.dataset.theme === 'light';
    btn.textContent = light ? '☾' : '☀';
    btn.title = light ? (lang === 'en' ? 'Dark mode' : '深色') : (lang === 'en' ? 'Light mode' : '淺色');
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('wt-theme', light ? 'light' : 'dark'); } catch { /* ignore */ }
    show();
  });
  show();
}

// Shared "i" info popover: info(title, html) returns a button; hover opens it with a mouse,
// tap opens / closes it on phones. One fixed-size popover element for the whole page.
const infoRegistry = new Map();
let infoSeq = 0;
let infoPop;
let infoBtn;
let infoTimer;
export function info(title, html) {
  const id = `i${++infoSeq}`;
  infoRegistry.set(id, { title, html });
  return `<button type="button" class="info-btn" data-info="${id}" aria-label="${esc(title)}" aria-haspopup="dialog">i</button>`;
}
function infoClose() { if (infoPop) infoPop.hidden = true; if (infoBtn) infoBtn.setAttribute('aria-expanded', 'false'); infoBtn = null; }
function infoOpen(btn) {
  const item = infoRegistry.get(btn.dataset.info);
  if (!item) return;
  clearTimeout(infoTimer);
  if (!infoPop) {
    infoPop = document.createElement('div');
    infoPop.className = 'info-pop';
    infoPop.setAttribute('role', 'dialog');
    infoPop.hidden = true;
    infoPop.innerHTML = '<div class="info-pop-head"><b></b><button type="button" class="close" aria-label="Close">×</button></div><div class="info-pop-body"></div>';
    document.body.append(infoPop);
    infoPop.querySelector('.close').addEventListener('click', infoClose);
    infoPop.addEventListener('mouseenter', () => clearTimeout(infoTimer));
    infoPop.addEventListener('mouseleave', () => { infoTimer = setTimeout(infoClose, 200); });
  }
  // A modal <dialog> sits in the browser's top layer; put the popover inside it so it shows above.
  const host = btn.closest('dialog[open]') || document.body;
  if (infoPop.parentElement !== host) host.append(infoPop);
  if (infoBtn && infoBtn !== btn) infoBtn.setAttribute('aria-expanded', 'false');
  infoBtn = btn;
  infoPop.querySelector('b').textContent = item.title;
  infoPop.querySelector('.info-pop-body').innerHTML = item.html; // trusted: written in our own code
  infoPop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  if (window.innerWidth <= 860) { infoPop.classList.add('centered'); infoPop.style.left = ''; infoPop.style.top = ''; return; }
  infoPop.classList.remove('centered');
  const r = btn.getBoundingClientRect();
  const w = infoPop.offsetWidth;
  const h = infoPop.offsetHeight;
  infoPop.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left))}px`;
  infoPop.style.top = `${r.bottom + 8 + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 8) : r.bottom + 8}px`;
}
if (typeof document !== 'undefined') {
  const hoverable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-info]');
    if (btn) { e.preventDefault(); e.stopPropagation(); if (infoBtn === btn && !infoPop.hidden) infoClose(); else infoOpen(btn); return; }
    if (infoPop && !infoPop.hidden && !infoPop.contains(e.target)) infoClose();
  }, true);
  if (hoverable) {
    document.addEventListener('mouseover', (e) => { const b = e.target.closest?.('[data-info]'); if (b) infoOpen(b); });
    document.addEventListener('mouseout', (e) => { const b = e.target.closest?.('[data-info]'); if (b) infoTimer = setTimeout(infoClose, 200); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') infoClose(); });
}

export async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(lang === 'en' ? 'en-GB' : 'zh-HK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' });
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
