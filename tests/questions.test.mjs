import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questions, shuffledQuestionIndices } from '../lib/questions.ts';

test('each round includes all 20 distinct questions exactly once', () => {
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions).size, 20);
  for (const random of [() => 0, () => 0.999999, Math.random]) {
    const order = shuffledQuestionIndices(undefined, random);
    assert.equal(order.length, questions.length);
    assert.deepEqual([...order].sort((a, b) => a - b), questions.map((_, i) => i));
  }
});

test('a fresh round never starts with the question that ended the last round', () => {
  for (let previous = 0; previous < questions.length; previous++) {
    for (const random of [() => 0, () => 0.999999]) {
      const order = shuffledQuestionIndices(previous, random);
      assert.notEqual(order[0], previous);
      assert.equal(new Set(order).size, questions.length);
    }
  }
});
