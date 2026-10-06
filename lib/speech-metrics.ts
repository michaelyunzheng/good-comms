export function speechMetrics(transcript: string, durationSeconds: number | null) {
  const words = transcript.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const counts = new Map<string, number>();
  // Conservative: do not label meaningful uses of “like” or “actually” as fillers.
  for (const word of words) {
    if (/^(um+|uh+|erm+|er+|hmm+)$/.test(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const fillers = Array.from(counts, ([word, count]) => ({ word, count }));
  const fillerCount = fillers.reduce((sum, item) => sum + item.count, 0);
  const repeatedWords = words.filter((word, index) => index > 0 && word === words[index - 1]).length;
  const duration = durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
  return {
    wordCount: words.length,
    wordsPerMinute: duration ? Math.round(words.length * 60 / duration) : null,
    fillerCount,
    fillers,
    fillersPer100Words: words.length ? Math.round(fillerCount * 1000 / words.length) / 10 : 0,
    repeatedWords,
  };
}

export type AudioFrame = { rms: number; pitch: number | null };
export type DeliveryStats = { energyRangeDb: number | null; pitchRangeSemitones: number | null; quietPercent: number | null; sampleCount: number };

// Downsample for inexpensive, conservative pitch estimation (no emotion/identity inference).
export function measureAudioFrame(samples: Float32Array, sampleRate: number): AudioFrame {
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  if (!Number.isFinite(rms) || rms < 0.008) return { rms: Number.isFinite(rms) ? rms : 0, pitch: null };
  const stride = Math.max(1, Math.floor(sampleRate / 8000));
  const data = Array.from({ length: Math.floor(samples.length / stride) }, (_, i) => samples[i * stride]);
  const rate = sampleRate / stride;
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
  for (let i = 0; i < data.length; i++) data[i] -= mean;
  const correlations: number[] = [];
  const minLag = Math.floor(rate / 500);
  const maxLag = Math.min(Math.ceil(rate / 70), Math.floor(data.length / 2));
  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0, left = 0, right = 0;
    for (let i = 0; i < data.length - lag; i++) {
      cross += data[i] * data[i + lag];
      left += data[i] ** 2;
      right += data[i + lag] ** 2;
    }
    correlations[lag] = cross / Math.sqrt(left * right || 1);
  }
  // The first strong local peak avoids choosing octave multiples of a clean pitch.
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (correlations[lag] > 0.8 && correlations[lag] > correlations[lag - 1] && correlations[lag] >= correlations[lag + 1]) {
      return { rms, pitch: rate / lag };
    }
  }
  return { rms, pitch: null };
}

function percentile(values: number[], fraction: number) {
  return values[Math.floor((values.length - 1) * fraction)];
}

export function summarizeDelivery(frames: AudioFrame[]): DeliveryStats | null {
  if (frames.length < 5) return null;
  const levels = frames.map(frame => frame.rms).sort((a, b) => a - b);
  const high = percentile(levels, 0.9);
  if (high < 0.008) return { energyRangeDb: null, pitchRangeSemitones: null, quietPercent: null, sampleCount: frames.length };
  const quietThreshold = Math.max(0.005, high * 0.15);
  const activeLevels = levels.filter(level => level > quietThreshold);
  const pitches = frames.flatMap(frame => frame.pitch && frame.pitch >= 70 && frame.pitch <= 500 ? [frame.pitch] : []).sort((a, b) => a - b);
  return {
    energyRangeDb: activeLevels.length >= 5 ? Math.round(20 * Math.log10(percentile(activeLevels, 0.9) / percentile(activeLevels, 0.1)) * 10) / 10 : null,
    pitchRangeSemitones: pitches.length >= 5 ? Math.round(12 * Math.log2(percentile(pitches, 0.9) / percentile(pitches, 0.1)) * 10) / 10 : null,
    quietPercent: Math.round(levels.filter(level => level <= quietThreshold).length * 100 / levels.length),
    sampleCount: frames.length,
  };
}
