import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
const cookie = createHash('sha256').update('test-only-password').digest('hex');

test('API rejects unauthenticated, malformed and oversized prompt requests before model calls', async ({ request }) => {
  expect((await request.post('/api/analyse', { data: { prompt: 'Question', transcript: 'An answer.' } })).status()).toBe(401);
  const headers = { Cookie: `clearly_access=${cookie}` };
  expect((await request.post('/api/analyse', { headers, data: '{' })).status()).toBe(400);
  expect((await request.post('/api/analyse', { headers, data: { prompt: 'x'.repeat(1001), transcript: 'An answer with enough words.' } })).status()).toBe(400);
  expect((await request.post('/api/analyse', { headers, data: { prompt: 'Question', transcript: 'x'.repeat(100001) } })).status()).toBe(413);
});

test('production endpoints fail closed when Redis is not configured', async ({ request }) => {
  expect((await request.post('/api/access', { data: { password: 'test-only-password' } })).status()).toBe(503);
  const headers = { Cookie: `clearly_access=${cookie}` };
  expect((await request.post('/api/analyse', { headers, data: { prompt: 'Question', transcript: 'An answer with enough words.' } })).status()).toBe(503);
  expect((await request.post('/api/transcribe', { headers, multipart: {
    audio: { name: 'response.webm', mimeType: 'audio/webm', buffer: Buffer.from('recorded speech') },
  } })).status()).toBe(503);
});

test('malformed access cookie is unauthorized rather than a server error', async ({ request }) => {
  const headers = { Cookie: `clearly_access=${'z'.repeat(64)}` };
  expect((await request.post('/api/analyse', { headers, data: {} })).status()).toBe(401);
});
