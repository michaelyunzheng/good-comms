import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveLocal, reserveLimits, requestRules, enforceLimit } from '../lib/rate-limit.ts';
import { readJsonBody } from '../lib/request-body.ts';

test('quota reservations are atomic and expire', () => {
  const rules = [
    { key: 'test:client', limit: 2, windowSeconds: 60 },
    { key: 'test:daily', limit: 1, windowSeconds: 86400 },
  ];
  assert.equal(reserveLocal(rules, 0).allowed, true);
  assert.deepEqual(reserveLocal(rules, 1000), { allowed: false, retryAfter: 86399 });
  // Rejection by the daily cap must not consume the remaining client quota.
  assert.equal(reserveLocal([rules[0]], 2000).allowed, true);
  assert.equal(reserveLocal([rules[0]], 3000).allowed, false);
  assert.equal(reserveLocal(rules, 86400000).allowed, true);
});

test('untrusted forwarded headers cannot bypass the shared limiter', () => {
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const a = requestRules(new Request('https://example.com', { headers: { 'x-forwarded-for': 'a' } }), 'paid');
    const b = requestRules(new Request('https://example.com', { headers: { 'x-forwarded-for': 'b' } }), 'paid');
    assert.deepEqual(a, b);
    assert.equal(a[1].limit, 200);
  } finally {
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
  }
});

test('production fails closed without shared limiter configuration', async () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try { await assert.rejects(reserveLimits([]), /not configured/); }
  finally { process.env = previous; }
});

test('Redis rejection returns HTTP 429 with Retry-After; outages do not allow requests', async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  try {
    globalThis.fetch = async (_url, options) => {
      const command = JSON.parse(options.body);
      assert.equal(command[0], 'EVAL');
      assert.equal(command[2], 2);
      return Response.json({ result: [0, 42] });
    };
    const denied = await enforceLimit(new Request('https://example.com'), 'paid');
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get('Retry-After'), '42');
    globalThis.fetch = async () => Response.json({ error: 'unavailable' });
    console.error = () => {};
    assert.equal((await enforceLimit(new Request('https://example.com'), 'paid')).status, 503);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; process.env = previous; }
});

test('JSON parsing rejects malformed and non-object bodies', async () => {
  for (const body of ['{', 'null', '[]', '"text"']) {
    await assert.rejects(readJsonBody(new Request('https://example.com', { method: 'POST', body }), 100), error => error.status === 400);
  }
  assert.deepEqual(await readJsonBody(new Request('https://example.com', { method: 'POST', body: '{"prompt":"ok"}' }), 100), { prompt: 'ok' });
});

test('JSON limit counts actual UTF-8 bytes, without trusting Content-Length', async () => {
  const request = new Request('https://example.com', {
    method: 'POST', headers: { 'Content-Length': '1' }, body: '{"text":"😀😀😀"}',
  });
  await assert.rejects(readJsonBody(request, 20), error => error.status === 413);
});
