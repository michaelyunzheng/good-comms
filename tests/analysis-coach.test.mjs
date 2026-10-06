import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySuggestion } from '../lib/analysis-coach.ts';
const review = (score, faithful = true, revision = '') => JSON.stringify({ score, faithful, reason: 'Rubric assessment', revision });

test('only a independently checked faithful 90+ response is returned', async () => {
  const result = await verifySuggestion(async request => {
    assert.equal(JSON.parse(request.input).candidateResponse, 'Full response');
    assert.equal(JSON.parse(request.input).originalTranscript, 'Original thought');
    return review(93);
  }, 'Question', 'Original thought', 'Full response');
  assert.equal(result.score, 93);
  assert.equal(result.response, 'Full response');
});

test('revisions are independently rescored before presentation', async () => {
  const seen = [];
  const result = await verifySuggestion(async request => {
    seen.push(JSON.parse(request.input).candidateResponse);
    return seen.length === 1 ? review(80, true, 'Faithful revision') : review(92);
  }, 'Question', 'Original', 'Candidate');
  assert.deepEqual(seen, ['Candidate', 'Faithful revision']);
  assert.equal(result.response, 'Faithful revision');
});

test('below threshold or invented rewrites are never shown; review work is bounded', async () => {
  for (const verdict of [review(89, true, 'Revision'), review(99, false, 'Revision'), review(101, true, 'Revision')]) {
    let calls = 0;
    assert.equal(await verifySuggestion(async () => { calls++; return verdict; }, 'Q', 'Original', 'Candidate'), null);
    assert.equal(calls, 2);
  }
});

test('optional scorer failures preserve feedback by returning no suggestion', async () => {
  for (const create of [async () => { throw new Error('Outage'); }, async () => 'not JSON', async () => '{}']) {
    assert.equal(await verifySuggestion(create, 'Q', 'Original', 'Candidate'), null);
  }
  let called = false;
  assert.equal(await verifySuggestion(async () => { called = true; return review(95); }, 'Q', 'Original', ''), null);
  assert.equal(called, false);
});
