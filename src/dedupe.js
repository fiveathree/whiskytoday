// Feed parsing and de-duplication helpers (pure functions, unit-tested). PLAN.md §4.2 steps 1–2.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeXml(s) {
  if (!s) return '';
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripTags(s) {
  return decodeXml(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

// Parse RSS 2.0 / RSS 1.0 / Atom. Returns [{ title, link, published, snippet }].
export function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const title = stripTags(tag(b, 'title') || '');
    let link = stripTags(tag(b, 'link') || '');
    if (!link) {
      // Atom: <link rel="alternate" href="..."/>
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
        || b.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = alt ? decodeXml(alt[1]) : '';
    }
    const dateRaw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = dateRaw ? Date.parse(stripTags(dateRaw)) : NaN;
    const snippet = stripTags(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || '').slice(0, 600);
    if (title && /^https?:\/\//i.test(link)) {
      out.push({ title, link, published: Number.isFinite(t) ? new Date(t).toISOString() : null, snippet });
    }
  }
  return out;
}

// Drop tracking params and fragments so the same story has one URL.
export function canonicalUrl(raw) {
  const u = new URL(raw);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_|ref$)/i.test(k)) u.searchParams.delete(k);
  }
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.protocol = 'https:';
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

const STOP = new Set(('a an the and or of to in on for with at by from is are was were be as its it this that ' +
  'new launches launch release releases released announces announced unveils first').split(' '));

export function titleTokens(title) {
  return String(title).toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

export function normalizeTitle(title) {
  return titleTokens(title).join(' ');
}

// Words too common in whisky headlines to say two stories are the same.
const GENERIC = new Set('whisky whiskey whiskies bourbon scotch single year years old edition bottle bottling'.split(' '));

// Crude stems: drop 1-letter tokens and generic words, keep the first 5 letters ("final"/"finale").
function stems(title) {
  return new Set(titleTokens(title).filter((w) => w.length > 1 && !GENERIC.has(w)).map((w) => w.slice(0, 5)));
}

// Dice similarity of title stems (0–1).
export function similarity(a, b) {
  const A = stems(a);
  const B = stems(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return (2 * inter) / (A.size + B.size);
}

// Before AI (raw titles, no category yet): only merge near-identical headlines.
export const SIMILAR_THRESHOLD = 0.75;
// After AI (English titles, same category): looser match.
export const SAME_EVENT_THRESHOLD = 0.5;
// After AI but the categories differ (e.g. new_release vs limited_release).
export const CROSS_CATEGORY_THRESHOLD = 0.6;

// Pick the cluster for a new title from recent articles [{ cluster_id, original_title, content_hash }].
export function findCluster(hash, title, recent) {
  for (const r of recent) if (r.content_hash === hash) return r.cluster_id;
  let best = null;
  let bestScore = SIMILAR_THRESHOLD;
  for (const r of recent) {
    const s = similarity(title, r.original_title);
    if (s >= bestScore) { best = r.cluster_id; bestScore = s; }
  }
  return best;
}

export function matchesKeywords(item, keywords) {
  if (!keywords) return true;
  const text = `${item.title} ${item.snippet}`.toLowerCase();
  return keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => text.includes(k));
}

export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
