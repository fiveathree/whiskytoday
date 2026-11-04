import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validatePrice } from '../src/csv.js';

test('parses quotes, commas, escaped quotes and CRLF', () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""",3\n\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'he said "hi"', '3']]);
});

test('valid price row converts major units to minor', () => {
  const r = validatePrice({ price_type: 'auction_total', amount: '12,500.5', currency: 'gbp', observed_at: '2026-10-01', is_public: 'yes' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.value.amount_minor, 1250050);
  assert.equal(r.value.currency, 'GBP');
  assert.equal(r.value.is_public, 1);
});

test('invalid rows report each bad field', () => {
  const r = validatePrice({ price_type: 'bid', amount: 'abc', currency: 'XYZ', observed_at: '1/10/2026', source_url: 'javascript:x' });
  assert.deepEqual(r.errors.sort(), ['amount', 'currency', 'observed_at', 'price_type', 'source_url']);
});

test('unsold lots may have no amount', () => {
  assert.deepEqual(validatePrice({ price_type: 'auction_unsold', amount: '', currency: 'HKD', observed_at: '2026-10-01' }).errors, []);
});
