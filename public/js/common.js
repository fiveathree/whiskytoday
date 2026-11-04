// Shared helpers: escaping, i18n, API calls.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only allow http(s) links from external data.
export const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');

const STR = {
  'nav.news': ['每日情報', 'Intelligence'],
  'nav.admin': ['後台', 'Admin'],
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
