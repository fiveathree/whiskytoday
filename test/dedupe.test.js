import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, canonicalUrl, normalizeTitle, similarity, findCluster, matchesKeywords, sha256hex, SAME_EVENT_THRESHOLD } from '../src/dedupe.js';
import { isInvestorFocus, buildEntityIndex, matchEntities } from '../src/rules.js';

test('parses RSS items with CDATA and entities', () => {
  const xml = `<rss><channel><item><title><![CDATA[Port Ellen 40 &amp; more]]></title>
    <link>https://ex.com/a?utm_source=x</link><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate>
    <description>&lt;p&gt;Hello &#8211; world&lt;/p&gt;</description></item></channel></rss>`;
  const [it] = parseFeed(xml);
  assert.equal(it.title, 'Port Ellen 40 & more');
  assert.equal(it.link, 'https://ex.com/a?utm_source=x');
  assert.equal(it.published, '2026-11-03T10:00:00.000Z');
  assert.equal(it.snippet, 'Hello – world');
});

test('parses Atom entries with link href', () => {
  const xml = `<feed><entry><title>Brora news</title><link rel="alternate" href="https://ex.com/b"/>
    <updated>2026-11-01T00:00:00Z</updated><summary>s</summary></entry></feed>`;
  const [it] = parseFeed(xml);
  assert.equal(it.link, 'https://ex.com/b');
  assert.equal(it.title, 'Brora news');
});

test('skips items without a http link', () => {
  assert.equal(parseFeed('<rss><item><title>x</title><link>javascript:alert(1)</link></item></rss>').length, 0);
});

test('canonical URL drops tracking params, fragment, www and trailing slash', () => {
  assert.equal(canonicalUrl('http://www.Ex.com/a/?utm_source=x&id=3#top'), 'https://ex.com/a?id=3');
  assert.equal(canonicalUrl('https://ex.com/a/'), 'https://ex.com/a');
});

test('normalized titles ignore case, punctuation and stop words', () => {
  assert.equal(normalizeTitle('The Macallan Launches New 30-Year-Old!'), normalizeTitle('macallan 30 year old'));
});

test('same hash joins the existing cluster', async () => {
  const h = await sha256hex(normalizeTitle('Brora reopens'));
  assert.equal(findCluster(h, 'Brora reopens', [{ cluster_id: 'c1', content_hash: h, original_title: 'x' }]), 'c1');
});

test('similar titles cluster, different ones do not', () => {
  const recent = [{ cluster_id: 'c1', content_hash: 'h', original_title: 'Diageo to mothball Roseisle distillery in Speyside' }];
  assert.equal(findCluster('x', 'Diageo to mothball Roseisle distillery', recent), 'c1');
  assert.equal(findCluster('y', 'Kavalan wins award in London', recent), null);
});

test('same event from two outlets reaches the post-AI threshold', () => {
  const s = similarity('The Macallan A Night on Earth Finale Honours New Orleans',
    "The Macallan's Final 'A Night on Earth' Whisky Is Inspired by New Orleans");
  assert.ok(s >= SAME_EVENT_THRESHOLD, `got ${s}`);
  assert.ok(similarity('Macallan A Night on Earth finale', 'Kavalan wins award in London') < SAME_EVENT_THRESHOLD);
  assert.ok(similarity('Diageo cancels 2026 Special Releases', 'Sazerac to invest $605m in Kentucky') < SAME_EVENT_THRESHOLD);
});

test('keyword filter', () => {
  assert.ok(matchesKeywords({ title: 'New Bourbon release', snippet: '' }, 'whisky,bourbon'));
  assert.ok(!matchesKeywords({ title: 'Gin sales rise', snippet: 'vodka too' }, 'whisky,bourbon'));
  assert.ok(matchesKeywords({ title: 'anything', snippet: '' }, null));
});

test('investor focus rule', () => {
  assert.ok(isInvestorFocus('auction', 1, false));
  assert.ok(!isInvestorFocus('new_release', 5, false));
  assert.ok(isInvestorFocus('new_release', 4, true));
  assert.ok(!isInvestorFocus('new_release', 3, true));
});

test('entity matching uses names, Chinese names and aliases', () => {
  const idx = buildEntityIndex([
    { id: 'macallan', name_en: 'Macallan', name_zh: '麥卡倫', aliases: '["The Macallan"]' },
    { id: 'karuizawa', name_en: 'Karuizawa', name_zh: '輕井澤', aliases: '["軽井沢"]' },
  ]);
  const r = matchEntities([{ name: 'The Macallan' }, { name: '軽井沢' }, { name: 'Karuizawa Distillery' }, { name: 'Unknown Co' }], idx);
  assert.deepEqual(r.matched.map((e) => e.id).sort(), ['karuizawa', 'macallan']);
  assert.deepEqual(r.unmatched.map((u) => u.name), ['Unknown Co']);
});
