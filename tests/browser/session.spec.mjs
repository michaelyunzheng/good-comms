import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const cookie = createHash('sha256').update('test-only-password').digest('hex');

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'clearly_access', value: cookie, url: 'http://127.0.0.1:3100' }]);
  await page.addInitScript(() => {
    const state = window.recordingTest = {
      permissionCalls: 0, stoppedTracks: 0, recorderStarts: 0,
      pendingPermission: false, throwOnStart: false, transcriptions: [],
      transcriptionFailures: 0, analysisResolvers: [],
      pendingTranscription: false, transcriptionResolvers: [],
    };
    const stream = { getTracks: () => [{ stop: () => { state.stoppedTracks += 1; } }] };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      state.permissionCalls += 1;
      if (state.pendingPermission) await new Promise(resolve => { state.releasePermission = resolve; });
      return stream;
    } });
    window.AudioContext = class { constructor() { throw new Error('Optional waveform unavailable'); } };
    window.MediaRecorder = class {
      state = 'inactive';
      mimeType = 'audio/webm';
      start() {
        if (state.throwOnStart) throw new Error('Recorder unavailable');
        state.recorderStarts += 1;
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['recorded speech'], { type: this.mimeType }) });
          this.onstop?.();
        });
      }
    };
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      if (input === '/api/transcribe') {
        state.transcriptions.push(await options.body.get('audio').text());
        if (state.pendingTranscription) return new Promise(resolve => { state.transcriptionResolvers.push(resolve); });
        if (state.transcriptionFailures-- > 0) return Response.json({ error: 'Service temporarily unavailable. Please retry.' }, { status: 503 });
        return Response.json({ transcript: 'My answer includes a concrete example and a clear conclusion.' });
      }
      // Deliberately ignore AbortSignal to verify stale-result guards independently.
      if (input === '/api/analyse') return new Promise(resolve => { state.analysisResolvers.push(resolve); });
      return fetchOriginal(input, options);
    };
  });
  await page.goto('/session');
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeVisible();
});

async function record(page) {
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Transcript' })).not.toBeDisabled();
}

async function beginAnalysis(page) {
  await page.getByRole('button', { name: 'Analyse', exact: false }).click();
  await expect.poll(() => page.evaluate(() => window.recordingTest.analysisResolvers.length)).toBe(1);
}

async function finishAnalysis(page, headline = 'Latest feedback') {
  await page.evaluate(headline => {
    const step = { status: 'clear', note: 'A useful example.' };
    window.recordingTest.analysisResolvers.shift()(Response.json({
      score: 80, label: 'Strong', headline, strongest: 'The example.', improve: 'Tighten the ending.',
      betterOpening: 'Here is my point.', metrics: { wordCount: 12, wordsPerMinute: 100 },
      framework: { openingPoint: step, what: step, soWhat: step, nowWhat: step, closingPoint: step },
    }));
  }, headline);
}

test('repeated clicks reserve one microphone request; New discards pending permission', async ({ page }) => {
  await page.evaluate(() => {
    window.recordingTest.pendingPermission = true;
    const button = document.querySelector('.record-button');
    button.click(); button.click();
  });
  await expect(page.getByRole('button', { name: 'Starting microphone' })).toBeDisabled();
  expect(await page.evaluate(() => window.recordingTest.permissionCalls)).toBe(1);
  await page.getByRole('button', { name: 'New' }).click();
  await page.evaluate(() => window.recordingTest.releasePermission());
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => [window.recordingTest.recorderStarts, window.recordingTest.stoppedTracks])).toEqual([0, 1]);
});

test('leaving while microphone permission is pending releases the eventual stream', async ({ page }) => {
  await page.evaluate(() => { window.recordingTest.pendingPermission = true; });
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('link', { name: 'clearly' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await page.evaluate(() => window.recordingTest.releasePermission());
  await expect.poll(() => page.evaluate(() => window.recordingTest.stoppedTracks)).toBe(1);
  expect(await page.evaluate(() => window.recordingTest.recorderStarts)).toBe(0);
});

test('recorder startup failure releases microphone and allows retry', async ({ page }) => {
  await page.evaluate(() => { window.recordingTest.throwOnStart = true; });
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByText("Couldn't start recording.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.recordingTest.stoppedTracks)).toBe(1);
  await page.evaluate(() => { window.recordingTest.throwOnStart = false; });
  await record(page);
  await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue(/concrete example/);
});

test('failed transcription can retry the same retained recording', async ({ page }) => {
  await page.evaluate(() => { window.recordingTest.transcriptionFailures = 1; });
  await record(page);
  await expect(page.getByText('Service temporarily unavailable. Please retry.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry transcription' }).click();
  await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue(/concrete example/);
  expect(await page.evaluate(() => window.recordingTest.transcriptions)).toEqual(['recorded speech', 'recorded speech']);
  await expect(page.getByRole('button', { name: 'Retry transcription' })).toHaveCount(0);
});

test('New discards analysis from the previous recording', async ({ page }) => {
  await record(page);
  await beginAnalysis(page);
  await page.getByRole('button', { name: 'New' }).click();
  await record(page);
  await finishAnalysis(page, 'Stale feedback');
  await expect(page.getByText('Stale feedback')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyse', exact: false })).toBeEnabled();
});

test('editing invalidates in-flight feedback and subsequent analysis works', async ({ page }) => {
  await record(page);
  await beginAnalysis(page);
  await page.getByRole('textbox', { name: 'Transcript' }).fill('An edited answer with a better example.');
  await finishAnalysis(page, 'Stale edited feedback');
  await expect(page.getByText('Stale edited feedback')).toHaveCount(0);
  await beginAnalysis(page);
  await finishAnalysis(page);
  await expect(page.getByRole('heading', { name: 'Latest feedback' })).toBeVisible();
});

test('New during recording releases the microphone and discards the take', async ({ page }) => {
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.recordingTest.transcriptions.length)).toBe(0);
  expect(await page.evaluate(() => window.recordingTest.stoppedTracks)).toBeGreaterThan(0);
});

test('recording works without waveform and playback seeking supports keyboard', async ({ page }) => {
  await record(page);
  const slider = page.getByRole('slider', { name: 'Playback position' });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('0.1');
  await expect(slider).toBeFocused();
});


test('partial waveform initialization failure closes AudioContext without stopping recording', async ({ page }) => {
  await page.evaluate(() => {
    window.recordingTest.closedContexts = 0;
    window.AudioContext = class {
      state = 'running';
      createAnalyser() { throw new Error('Analyser unavailable'); }
      async close() { window.recordingTest.closedContexts += 1; this.state = 'closed'; }
    };
  });
  await record(page);
  expect(await page.evaluate(() => window.recordingTest.closedContexts)).toBe(1);
});

test('retrying transcription invalidates analysis of a manually edited transcript', async ({ page }) => {
  await page.evaluate(() => { window.recordingTest.transcriptionFailures = 1; });
  await record(page);
  await page.getByRole('textbox', { name: 'Transcript' }).fill('My manually entered answer before retry.');
  await beginAnalysis(page);
  await page.getByRole('button', { name: 'Retry transcription' }).click();
  await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue(/concrete example/);
  await finishAnalysis(page, 'Feedback for obsolete manual text');
  await expect(page.getByText('Feedback for obsolete manual text')).toHaveCount(0);
});

test('New ignores a stale transcription even if cancellation is ignored', async ({ page }) => {
  await page.evaluate(() => { window.recordingTest.pendingTranscription = true; });
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.recordingTest.transcriptionResolvers.length)).toBe(1);
  await page.getByRole('button', { name: 'New' }).click();
  await page.evaluate(() => { window.recordingTest.pendingTranscription = false; });
  await record(page);
  await page.evaluate(() => window.recordingTest.transcriptionResolvers.shift()(Response.json({ transcript: 'Stale transcription' })));
  await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue(/concrete example/);
});

test('mobile practice and feedback remain usable without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await record(page);
  await beginAnalysis(page);
  await finishAnalysis(page);
  await expect(page.getByRole('heading', { name: 'Latest feedback' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('New question explores a whole round before repeating and keeps the starting hint', async ({ page }) => {
  const question = page.locator('.session-question h2');
  const round = [await question.innerText()];
  await expect(page.locator('.question-hint')).toContainText('Share a moment or example');
  for (let i = 1; i < 20; i++) {
    await page.getByRole('button', { name: 'New question', exact: true }).click();
    await expect(question).not.toHaveText(round.at(-1));
    round.push(await question.innerText());
  }
  expect(new Set(round).size).toBe(20);
  await page.getByRole('button', { name: 'New question', exact: true }).click();
  await expect(question).not.toHaveText(round.at(-1));
  expect(round).toContain(await question.innerText());
});
