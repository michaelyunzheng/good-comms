import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechMetrics, measureAudioFrame, summarizeDelivery } from '../lib/speech-metrics.ts';

test('pace and conservative fillers use the edited transcript without counting meaningful words', () => {
  const result = speechMetrics("Um, I I actually like this. Uh, it's useful.", 30);
  assert.equal(result.wordCount, 9);
  assert.equal(result.wordsPerMinute, 18);
  assert.equal(result.fillerCount, 2);
  assert.equal(result.fillersPer100Words, 22.2);
  assert.equal(result.repeatedWords, 1);
  assert.deepEqual(result.fillers, [{ word: 'um', count: 1 }, { word: 'uh', count: 1 }]);
  for (const duration of [null, 0, -1, Infinity, NaN]) assert.equal(speechMetrics('hello world', duration).wordsPerMinute, null);
  assert.equal(speechMetrics('', 60).fillersPer100Words, 0);
  assert.equal(speechMetrics('Café — it’s good!', 60).wordCount, 3);
});

test('pitch tracks clean tones and silence stays unmeasured', () => {
  for (const frequency of [100, 200, 300]) {
    const samples = Float32Array.from({ length: 2048 }, (_, i) => .1 * Math.sin(2 * Math.PI * frequency * i / 48000));
    const frame = measureAudioFrame(samples, 48000);
    assert.ok(Math.abs(frame.pitch - frequency) < 8, `${frequency}: ${frame.pitch}`);
    assert.ok(frame.rms > .06 && frame.rms < .08);
  }
  assert.deepEqual(measureAudioFrame(new Float32Array(2048), 48000), { rms: 0, pitch: null });
  assert.equal(summarizeDelivery([]), null);
  assert.equal(summarizeDelivery(Array.from({ length: 10 }, () => ({ rms: 0, pitch: null }))).pitchRangeSemitones, null);
});

test('relative energy is gain invariant and pitch range uses voiced frames', () => {
  const frames = Array.from({ length: 20 }, (_, i) => ({ rms: i < 5 ? .001 : i < 12 ? .05 : .1, pitch: i < 5 ? null : i < 12 ? 100 : 200 }));
  const stats = summarizeDelivery(frames);
  assert.equal(stats.quietPercent, 25);
  assert.equal(stats.energyRangeDb, 6);
  assert.equal(stats.pitchRangeSemitones, 12);
  assert.equal(summarizeDelivery(frames.map(frame => ({ ...frame, rms: frame.rms * 2 }))).energyRangeDb, 6);
});
