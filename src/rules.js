// Investor-focus rule and entity matching (pure functions). PLAN.md §4.3, §4.2 step 5.

export const CATEGORIES = [
  'auction', 'record_price', 'distillery_closure', 'distillery_reopen', 'acquisition', 'limited_release',
  'new_release', 'market_index', 'regulation_tax', 'fx_trade', 'counterfeit', 'industry',
  'education_history', 'event',
];

const INVESTOR_CATEGORIES = new Set([
  'auction', 'record_price', 'distillery_closure', 'distillery_reopen', 'acquisition', 'limited_release',
  'market_index', 'regulation_tax', 'fx_trade', 'counterfeit',
]);

export function isInvestorFocus(category, importance, linksTrackedEntity) {
  if (INVESTOR_CATEGORIES.has(category)) return true;
  return importance >= 4 && linksTrackedEntity;
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKC').replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]/gu, '');
}

// Build a lookup from every name / zh name / alias to the entity row.
export function buildEntityIndex(entities) {
  const idx = new Map();
  for (const e of entities) {
    let aliases = [];
    try { aliases = JSON.parse(e.aliases || '[]'); } catch { /* ignore bad JSON */ }
    for (const name of [e.name_en, e.name_zh, ...aliases]) {
      const k = norm(name);
      if (k && !idx.has(k)) idx.set(k, e);
    }
  }
  return idx;
}

// Returns { matched: [entity], unmatched: [{name, type}] } for AI-extracted entities.
export function matchEntities(extracted, index) {
  const matched = new Map();
  const unmatched = [];
  for (const x of extracted || []) {
    const e = index.get(norm(x.name)) || index.get(norm(String(x.name).replace(/\s+distillery$/i, '')));
    if (e) matched.set(e.id, e);
    else if (x.name) unmatched.push({ name: String(x.name).slice(0, 120), type: x.type || null });
  }
  return { matched: [...matched.values()], unmatched };
}
