// Minimal RFC 4180 CSV parser and price-row validation for CSV import (PLAN §5). Pure functions.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

export const PRICE_TYPES = ['auction_hammer', 'auction_total', 'auction_unsold', 'dealer_ask', 'private_sale', 'msrp'];
export const CURRENCIES = ['HKD', 'USD', 'GBP', 'EUR', 'JPY', 'CNY', 'SGD', 'TWD'];
export const CSV_COLUMNS = ['edition_slug', 'price_type', 'amount', 'currency', 'observed_at', 'market', 'venue', 'lot_number',
  'condition_note', 'source_url', 'volume_ml', 'is_public'];

// Validate one price input (form or CSV). Returns { value, errors[] }; amounts come in major units.
export function validatePrice(input) {
  const errors = [];
  const v = {};
  v.price_type = String(input.price_type || '').trim();
  if (!PRICE_TYPES.includes(v.price_type)) errors.push('price_type');
  v.currency = String(input.currency || '').trim().toUpperCase();
  if (!CURRENCIES.includes(v.currency)) errors.push('currency');
  const amt = String(input.amount ?? '').replace(/[,\s]/g, '');
  if (amt === '') {
    if (v.price_type !== 'auction_unsold') errors.push('amount');
    v.amount_minor = null;
  } else if (!/^\d+(\.\d{1,2})?$/.test(amt)) errors.push('amount');
  else v.amount_minor = Math.round(Number(amt) * 100);
  const d = String(input.observed_at || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) errors.push('observed_at');
  else v.observed_at = `${d}T00:00:00.000Z`;
  for (const k of ['market', 'venue', 'lot_number', 'condition_note']) v[k] = String(input[k] ?? '').trim().slice(0, 300) || null;
  const url = String(input.source_url ?? '').trim();
  if (url && !/^https?:\/\//i.test(url)) errors.push('source_url');
  v.source_url = url || null;
  const vol = String(input.volume_ml ?? '').trim();
  if (vol && !/^\d{2,5}$/.test(vol)) errors.push('volume_ml');
  v.volume_ml = vol ? Number(vol) : null;
  v.is_public = ['1', 'true', 'yes', 'y'].includes(String(input.is_public ?? '').trim().toLowerCase()) || input.is_public === true ? 1 : 0;
  return { value: v, errors };
}
