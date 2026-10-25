import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { searchOptions, normalizeListing, searchMarktplaats, SourceError } from '../lib.js';
import { createServer } from '../server.js';

const fixture = (overrides = {}) => ({
  itemId: 'm123', title: 'Nintendo Switch OLED', vipUrl: '/v/spelcomputers/nintendo-switch/m123-switch',
  priceInfo: { priceCents: 17500, priceType: 'FIXED' }, imageUrls: ['//evil.example/not-trusted.jpg'],
  location: { cityName: 'Utrecht' }, ...overrides
});

test('search validation accepts decimal budgets, rejects invalid inputs', () => {
  assert.deepEqual(searchOptions(new URLSearchParams('q=Switch&max=175.50')), { query: 'Switch', max: 175.5 });
  assert.equal(searchOptions(new URLSearchParams('q=Switch')).max, null);
  for (const params of ['q=', 'q=Switch&max=-1', 'q=Switch&max=NaN', `q=${'a'.repeat(101)}`]) assert.throws(() => searchOptions(new URLSearchParams(params)), { status: 400 });
});

test('listing normalization preserves prices and rejects hostile URLs', () => {
  const item = normalizeListing(fixture());
  assert.equal(item.price, 175); assert.equal(item.location, 'Utrecht'); assert.equal(item.image, null);
  assert.match(item.url, /^https:\/\/www.marktplaats.nl\//);
  assert.equal(normalizeListing(fixture({ vipUrl: 'https://www.marktplaats.nl.evil.example/ad' })), null);
  assert.equal(normalizeListing(fixture({ vipUrl: 'javascript:alert(1)' })), null);
  assert.equal(normalizeListing(fixture({ priceInfo: { priceType: 'BID', priceCents: 0 } })).price, null);
  assert.equal(normalizeListing(fixture({ imageUrls: ['https://i.ebayimg.com/picture.jpg'] })).image, null);
  assert.equal(normalizeListing(fixture({ imageUrls: ['//images.mpcdn.net/picture.jpg'] })).image, 'https://images.mpcdn.net/picture.jpg');
});

test('public search sends correct terms and filters over-budget, unknown and duplicate listings', async () => {
  let requested;
  const fetcher = async (url, options) => {
    requested = url; assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ listings: [fixture(), fixture(), fixture({ itemId: 'expensive', priceInfo: { priceCents: 30000 } }), fixture({ itemId: 'unknown', priceInfo: { priceType: 'BID' } }), fixture({ itemId: 'free', priceInfo: { priceType: 'FIXED', priceCents: 0 } })] }) };
  };
  const result = await searchMarktplaats({ query: 'Nintendo Switch', max: 200 }, fetcher);
  assert.equal(requested.hostname, 'www.marktplaats.nl'); assert.equal(requested.searchParams.get('query'), 'Nintendo Switch');
  assert.equal(requested.searchParams.get('priceTo'), '20000');
  assert.deepEqual(result.listings.map(item => item.id), ['m123', 'free']);
  assert.ok(Date.parse(result.fetchedAt));
});

test('network failures, blocked responses and changed schemas become explicit errors', async () => {
  const options = { query: 'Switch', max: null };
  await assert.rejects(searchMarktplaats(options, async () => { throw new Error('offline'); }), /niet bereikbaar/);
  await assert.rejects(searchMarktplaats(options, async () => ({ ok: false, status: 429 })), /even te wachten/);
  await assert.rejects(searchMarktplaats(options, async () => ({ ok: false, status: 403 })), /niet toe/);
  await assert.rejects(searchMarktplaats(options, async () => ({ ok: true, json: async () => { throw new Error('HTML'); } })), /geen leesbare/);
  await assert.rejects(searchMarktplaats(options, async () => ({ ok: true, json: async () => ({ unexpected: [] }) })), /indeling/);
  const result = await searchMarktplaats(options, async () => ({ ok: true, json: async () => ({ listings: [] }) }));
  assert.deepEqual(result.listings, []);
});

async function withServer(search, fn) {
  const server = createServer(search); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('HTTP server serves app/assets, rejects invalid input and caches searches', async () => {
  let calls = 0;
  await withServer(async (options) => { calls++; return { listings: [normalizeListing(fixture())], source: 'Marktplaats' }; }, async (base) => {
    const home = await fetch(base); assert.equal(home.status, 200); assert.match(await home.text(), /KoopjesJagertje/);
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const asset of ['style.css', 'app.js']) assert.equal((await fetch(`${base}/${asset}`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok' });
    assert.equal((await fetch(`${base}/api/search?q=`)).status, 400);
    const first = await fetch(`${base}/api/search?q=Switch&max=200`); assert.equal(first.status, 200);
    assert.equal((await first.json()).listings[0].price, 175);
    assert.equal((await (await fetch(`${base}/api/search?q=Switch&max=200`)).json()).cached, true);
    assert.equal(calls, 1);
    assert.equal((await fetch(`${base}/api/search?q=Camera`)).status, 429);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    const hostStatus = await new Promise((resolve, reject) => {
      http.get(base, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(hostStatus, 403);
  });
});

test('HTTP source errors never masquerade as empty successful results', async () => {
  await withServer(async () => { throw new SourceError('Bron geblokkeerd'); }, async base => {
    const response = await fetch(`${base}/api/search?q=Switch`);
    assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'Bron geblokkeerd' });
  });
});
