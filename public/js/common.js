// Shared helpers: escaping, i18n, API calls.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only allow http(s) links from external data.
export const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');

const STR = {
  'nav.news': ['每日情報', 'Intelligence'],
  'nav.admin': ['後台', 'Admin'],
  'nav.trends': ['市場趨勢', 'Trends'],
  'nav.whisky': ['酒款', 'Collection'],
  'title.whisky': ['精選酒款', 'Collection'], 'search.whisky': ['搜尋酒款或酒廠…', 'Search bottlings or distilleries…'],
  'f.tier': ['評級', 'Tier'], 'w.items': ['款', 'bottlings'], 'w.last': ['最近公開成交', 'Last public sale'],
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
  'disclaimer.full': ['本頁資料僅供市場參考，並非投資建議，不保證任何成交價或回報。', 'For market reference only. Not investment advice; no price or return is guaranteed.'],
  'collect': ['立即收集新聞', 'Collect now'],
  'collecting': ['收集中…約 3–5 分鐘，請勿關閉', 'Collecting… 3–5 min, keep open'],
  'collect.done': ['收集完成', 'Collection finished'],
  'collect.fail': ['未完成：', 'Not finished: '],
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
