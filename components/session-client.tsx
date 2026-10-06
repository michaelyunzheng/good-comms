"use client";

import Link from "next/link";
import { speechMetrics, measureAudioFrame, summarizeDelivery, type AudioFrame, type DeliveryStats } from "@/lib/speech-metrics";
import { usePracticeFocus } from "@/lib/practice-focus";
import { questions as prompts, questionHint, shuffledQuestionIndices } from "@/lib/questions";
import { Brand } from "@/components/brand";
import { SoundOrb } from "@/components/sound-orb";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Phase =
  | "prep"
  | "recording"
  | "review";

type Status =
  | "idle"
  | "loading"
  | "ready"
  | "error";

type FrameworkStatus =
  | "clear"
  | "partial"
  | "missing";

type FrameworkResult = {
  status: FrameworkStatus;
  note: string;
};

type Analysis = {
  score: number;

  label: string;

  headline: string;

  strongest: string;

  improve: string;

  suggestedResponse: string | null;
  suggestionScore: number | null;
  suggestionReason: string | null;

  metrics: ReturnType<typeof speechMetrics>;

  framework: {
    openingPoint:
      FrameworkResult;

    what:
      FrameworkResult;

    soWhat:
      FrameworkResult;

    nowWhat:
      FrameworkResult;

    closingPoint:
      FrameworkResult;
  };
};

type WebkitWindow =
  Window &
    typeof globalThis & {
      webkitAudioContext?:
        typeof AudioContext;
    };

const PREP_DURATION = 90;
const MAX_RECORDING_DURATION =
  120;

const BAR_COUNT = 35;

const idleWaveform =
  Array.from(
    {
      length: BAR_COUNT,
    },
    (_, index) =>
      12 +
      ((index * 17 +
        index * index * 3) %
        42)
  );


function formatTime(
  seconds: number
) {
  const minutes =
    Math.floor(seconds / 60);

  const remaining =
    seconds % 60;

  return `${minutes}:${remaining
    .toString()
    .padStart(2, "0")}`;
}

function getAudioExtension(
  mimeType: string
) {
  const clean =
    mimeType
      .split(";")[0]
      .toLowerCase();

  if (
    clean.includes("webm")
  ) {
    return "webm";
  }

  if (
    clean.includes("mp4")
  ) {
    return "mp4";
  }

  if (
    clean.includes("ogg")
  ) {
    return "ogg";
  }

  if (
    clean.includes("wav")
  ) {
    return "wav";
  }

  if (
    clean.includes("mpeg") ||
    clean.includes("mp3")
  ) {
    return "mp3";
  }

  return "webm";
}

export default function SessionClient({ initialQuestionOrder }: { initialQuestionOrder: number[] }) {
  const [speakingMode, setSpeakingMode] = useState<"question" | "free">("question");
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const audioFramesRef = useRef<AudioFrame[]>([]);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusQuestionRef = useRef(false);
  const { focus, saveFocus, clearFocus } = usePracticeFocus();
  const [focusStatus, setFocusStatus] = useState("");
  const remainingQuestionsRef = useRef(initialQuestionOrder.slice(1));
  const lastQuestionRef = useRef(initialQuestionOrder[0]);
  const [
    phase,
    setPhase,
  ] =
    useState<Phase>("prep");

  const [
    promptIndex,
    setPromptIndex,
  ] =
    useState(initialQuestionOrder[0]);

  const activePrompt = speakingMode === "free" ? "Share whatever is on your mind. Find and express your own central thought." : prompts[promptIndex];

  const [
    prepSeconds,
    setPrepSeconds,
  ] =
    useState(
      PREP_DURATION
    );

  const [
    recordingSeconds,
    setRecordingSeconds,
  ] =
    useState(0);

  const [
    audioUrl,
    setAudioUrl,
  ] =
    useState<
      string | null
    >(null);

  const [
    transcript,
    setTranscript,
  ] =
    useState("");

  const [
    waveform,
    setWaveform,
  ] =
    useState<number[]>(
      idleWaveform
    );

  const [
    microphoneError,
    setMicrophoneError,
  ] =
    useState("");

  const [
    transcriptionStatus,
    setTranscriptionStatus,
  ] =
    useState<Status>("idle");

  const [
    transcriptionError,
    setTranscriptionError,
  ] =
    useState("");

  const [
    analysisStatus,
    setAnalysisStatus,
  ] =
    useState<Status>("idle");

  const [
    analysisError,
    setAnalysisError,
  ] =
    useState("");

  const [
    analysis,
    setAnalysis,
  ] =
    useState<
      Analysis | null
    >(null);

  const [startingRecording, setStartingRecording] = useState(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const audioBlobRef = useRef<Blob | null>(null);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const analysisVersionRef = useRef(0);

  function invalidateAnalysis() {
    analysisVersionRef.current += 1;
    analysisControllerRef.current?.abort();
  }

  const recorderRef =
    useRef<
      MediaRecorder | null
    >(null);

  const streamRef =
    useRef<
      MediaStream | null
    >(null);

  const recordingStartedAtRef = useRef<number | null>(null);

  const audioUrlRef =
    useRef<
      string | null
    >(null);

  const audioContextRef =
    useRef<
      AudioContext | null
    >(null);

  const analyserRef =
    useRef<
      AnalyserNode | null
    >(null);

  const analyserFrameRef =
    useRef<
      number | null
    >(null);

  const analyserLastFrameRef =
    useRef(0);

  /*
   * Lets us ignore stale
   * transcription responses
   * after "New".
   */
  const requestVersionRef =
    useRef(0);

  const replaceAudioUrl =
    useCallback(
      (
        url:
          | string
          | null
      ) => {
        if (
          audioUrlRef.current
        ) {
          URL.revokeObjectURL(
            audioUrlRef.current
          );
        }

        audioUrlRef.current =
          url;

        setAudioUrl(url);
      },
      []
    );

  const stopAnalyser =
    useCallback(() => {
      if (
        analyserFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          analyserFrameRef.current
        );

        analyserFrameRef.current =
          null;
      }

      if (
        audioContextRef.current &&
        audioContextRef
          .current.state !==
          "closed"
      ) {
        audioContextRef.current
          .close()
          .catch(
            () => {}
          );
      }

      audioContextRef.current =
        null;

      analyserRef.current =
        null;

      setWaveform(
        idleWaveform
      );
    }, []);

  const startAnalyser =
    useCallback(
      (
        stream:
          MediaStream
      ) => {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as WebkitWindow
          )
            .webkitAudioContext;

        if (
          !AudioContextClass
        ) {
          return;
        }

        const context =
          new AudioContextClass();

        audioContextRef.current = context;

        const analyser =
          context.createAnalyser();

        const source =
          context.createMediaStreamSource(
            stream
          );

        analyser.fftSize = 2048;

        analyser.smoothingTimeConstant =
          0.78;

        source.connect(
          analyser
        );

        analyserRef.current =
          analyser;

        const data =
          new Uint8Array(
            analyser.frequencyBinCount
          );

        const timeData = new Float32Array(analyser.fftSize);
        let lastMeasurement = 0;

        function draw(
          timestamp: number
        ) {
          const active =
            analyserRef.current;

          if (!active) {
            return;
          }

          if (timestamp - lastMeasurement >= 200 && typeof active.getFloatTimeDomainData === "function") {
            lastMeasurement = timestamp;
            try {
              active.getFloatTimeDomainData(timeData);
              if (audioFramesRef.current.length < 3000) audioFramesRef.current.push(measureAudioFrame(timeData, context.sampleRate));
            } catch { /* Delivery statistics are optional; recording and waveform still work. */ }
          }

          if (
            timestamp -
              analyserLastFrameRef.current >=
            34
          ) {
            analyserLastFrameRef.current =
              timestamp;

            active.getByteFrequencyData(
              data
            );

            const next =
              Array.from(
                {
                  length:
                    BAR_COUNT,
                },
                (
                  _,
                  index
                ) => {
                  const dataIndex =
                    Math.floor(
                      (index /
                        (BAR_COUNT -
                          1)) *
                        (data.length -
                          1)
                    );

                  const level =
                    data[
                      dataIndex
                    ] /
                    255;

                  return Math.max(
                    9,
                    Math.min(
                      100,
                      10 +
                        level *
                          110
                    )
                  );
                }
              );

            setWaveform(
              next
            );
          }

          analyserFrameRef.current =
            requestAnimationFrame(
              draw
            );
        }

        analyserFrameRef.current =
          requestAnimationFrame(
            draw
          );
      },
      []
    );

  const stopRecording =
    useCallback(() => {
      const recorder =
        recorderRef.current;

      if (
        recorder?.state ===
        "recording"
      ) {
        recorder.stop();
      }
    }, []);

  async function transcribeAudio(
    blob: Blob,
    version: number
  ) {
    invalidateAnalysis();
    setAnalysis(null);
    setAnalysisStatus("idle");
    setAnalysisError("");
    transcriptionControllerRef.current?.abort();
    const controller = new AbortController();
    transcriptionControllerRef.current = controller;
    setTranscriptionStatus(
      "loading"
    );

    setTranscriptionError(
      ""
    );

    try {
      const mimeType =
        blob.type ||
        "audio/webm";

      const extension =
        getAudioExtension(
          mimeType
        );

      const file =
        new File(
          [blob],
          `response.${extension}`,
          {
            type:
              mimeType,
          }
        );

      const formData =
        new FormData();

      formData.append(
        "audio",
        file
      );

      const response =
        await fetch(
          "/api/transcribe",
          {
            method:
              "POST",

            body:
              formData,
            signal: controller.signal,
          }
        );

      const data = await response.json().catch(() => {
        throw new Error("Service returned an unexpected response. Please try again.");
      });

      if (
        controller.signal.aborted || !mountedRef.current || version !==
        requestVersionRef.current
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "Session access expired. Sign in again." : data.error ||
            "Transcription failed. Please retry."
        );
      }

      setTranscript(
        data.transcript
      );

      setTranscriptionStatus(
        "ready"
      );
    } catch (error) {
      if (
        controller.signal.aborted || !mountedRef.current || version !==
        requestVersionRef.current
      ) {
        return;
      }

      console.error(
        error
      );

      setTranscriptionStatus(
        "error"
      );

      setTranscriptionError(
        error instanceof TypeError ? "Connection failed. Check your network and retry." : error instanceof Error ? error.message : "Couldn't transcribe. Please retry."
      );
    }
  }

  async function analyseResponse() {
    if (
      !transcript.trim() ||
      analysisStatus ===
        "loading"
    ) {
      return;
    }

    invalidateAnalysis();
    const version = analysisVersionRef.current;
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    setAnalysisStatus(
      "loading"
    );

    setAnalysisError(
      ""
    );

    setAnalysis(null);

    try {
      const response =
        await fetch(
          "/api/analyse",
          {
            method:
              "POST",

            signal: controller.signal,
            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                prompt: activePrompt,
                mode: speakingMode,

                transcript:
                  transcript.trim(),

                durationSeconds:
                  recordingSeconds,
              }),
          }
        );

      const data = await response.json().catch(() => {
        throw new Error("Service returned an unexpected response. Please try again.");
      });

      if (!mountedRef.current || version !== analysisVersionRef.current) return;

      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "Session access expired. Sign in again." : data.error ||
            "Analysis failed. Please retry."
        );
      }

      setAnalysis(data);

      setAnalysisStatus(
        "ready"
      );
    } catch (error) {
      if (!mountedRef.current || version !== analysisVersionRef.current) return;
      console.error(
        error
      );

      setAnalysisStatus(
        "error"
      );

      setAnalysisError(
        error instanceof TypeError ? "Connection failed. Check your network and retry." : error instanceof Error ? error.message : "Couldn't analyse this one."
      );
    }
  }

  useEffect(() => {
    if (
      phase !== "prep" ||
      prepSeconds <= 0
    ) {
      return;
    }

    const timeout =
      window.setTimeout(
        () => {
          setPrepSeconds(
            (current) =>
              Math.max(
                0,
                current - 1
              )
          );
        },
        1000
      );

    return () =>
      window.clearTimeout(
        timeout
      );
  }, [
    phase,
    prepSeconds,
  ]);

  useEffect(() => {
    if (
      phase !==
      "recording"
    ) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          if (recordingStartedAtRef.current !== null) {
            const elapsed = Math.floor((performance.now() - recordingStartedAtRef.current) / 1000);
            setRecordingSeconds(elapsed);
            if (elapsed >= MAX_RECORDING_DURATION) stopRecording();
          }
        },
        1000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [phase, stopRecording]);

  useEffect(() => {
    if (
      phase ===
        "recording" &&
      recordingSeconds >=
        MAX_RECORDING_DURATION
    ) {
      stopRecording();
    }
  }, [
    phase,
    recordingSeconds,
    stopRecording,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
      analysisVersionRef.current += 1;
      transcriptionControllerRef.current?.abort();
      analysisControllerRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      audioBlobRef.current = null;
      streamRef.current
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop()
        );

      if (
        audioUrlRef.current
      ) {
        URL.revokeObjectURL(
          audioUrlRef.current
        );
      }

      if (
        analyserFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          analyserFrameRef.current
        );
      }

      audioContextRef.current
        ?.close()
        .catch(
          () => {}
        );
    };
  }, []);

  function getStepState(
    step: Phase
  ) {
    const order: Phase[] =
      [
        "prep",
        "recording",
        "review",
      ];

    if (
      phase === step
    ) {
      return "active";
    }

    if (
      order.indexOf(step) <
      order.indexOf(phase)
    ) {
      return "complete";
    }

    return "waiting";
  }

  function resetTake(changeQuestion: boolean) {
    audioFramesRef.current = [];
    setDeliveryStats(null);
    focusQuestionRef.current = true;
    setFocusStatus("");
    invalidateAnalysis();
    transcriptionControllerRef.current?.abort();
    audioBlobRef.current = null;
    requestVersionRef.current +=
      1;

    const recorder =
      recorderRef.current;

    if (
      recorder?.state ===
      "recording"
    ) {
      recorder.stop();
    }

    stopAnalyser();

    streamRef.current
      ?.getTracks()
      .forEach(
        (track) =>
          track.stop()
      );

    if (changeQuestion && speakingMode === "question") {
      if (!remainingQuestionsRef.current.length) {
        remainingQuestionsRef.current = shuffledQuestionIndices(lastQuestionRef.current);
      }
      const nextQuestion = remainingQuestionsRef.current.shift()!;
      lastQuestionRef.current = nextQuestion;
      setPromptIndex(nextQuestion);
    }

    replaceAudioUrl(
      null
    );

    setTranscript("");

    setRecordingSeconds(
      0
    );

    setPrepSeconds(
      PREP_DURATION
    );

    setMicrophoneError(
      ""
    );

    setTranscriptionStatus(
      "idle"
    );

    setTranscriptionError(
      ""
    );

    setAnalysisStatus(
      "idle"
    );

    setAnalysisError("");

    setAnalysis(null);
    recordingStartedAtRef.current = null;

    setPhase("prep");
  }

  function newPrompt() {
    resetTake(true);
  }

  function retryPrompt() {
    resetTake(false);
  }

  function changeMode(mode: "question" | "free") {
    if (mode === speakingMode) return;
    resetTake(false);
    setSpeakingMode(mode);
  }

  async function startRecording() {
    if (startingRef.current || recorderRef.current?.state === "recording") return;
    startingRef.current = true;
    audioFramesRef.current = [];
    setDeliveryStats(null);
    setStartingRecording(true);
    const version = requestVersionRef.current;
    let acquiredStream: MediaStream | null = null;
    setMicrophoneError(
      ""
    );

    setAnalysis(null);

    setAnalysisStatus(
      "idle"
    );

    setTranscript("");

    setTranscriptionStatus(
      "idle"
    );

    if (
      !navigator.mediaDevices ||
      !window.MediaRecorder
    ) {
      setMicrophoneError(
        "Recording isn't supported here."
      );

      startingRef.current = false;
      setStartingRecording(false);
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
          }
        );

      acquiredStream = stream;
      if (!mountedRef.current || version !== requestVersionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current =
        stream;

      const recorder =
        new MediaRecorder(
          stream
        );

      recorderRef.current =
        recorder;

      const chunks: Blob[] = [];

      const startedAt = performance.now();
      recordingStartedAtRef.current = startedAt;
      recorder.ondataavailable =
        (event) => {
          if (
            event.data
              .size > 0
          ) {
            chunks.push(
              event.data
            );
          }
        };

      recorder.onstop =
        () => {
          if (recorderRef.current === recorder) {
            recorderRef.current = null;
            streamRef.current = null;
            if (mountedRef.current) stopAnalyser();
          }

          stream
            .getTracks()
            .forEach(
              (track) =>
                track.stop()
            );

          if (
            !mountedRef.current || version !== requestVersionRef.current
          ) {
            return;
          }

          setDeliveryStats(summarizeDelivery(audioFramesRef.current));
          audioFramesRef.current = [];

          const blob =
            new Blob(
              chunks,
              {
                type:
                  recorder.mimeType,
              }
            );

          setRecordingSeconds(Math.max(1, Math.round((performance.now() - startedAt) / 1000)));
          recordingStartedAtRef.current = null;
          audioBlobRef.current = blob;
          const url =
            URL.createObjectURL(
              blob
            );

          replaceAudioUrl(
            url
          );

          setPhase(
            "review"
          );

          void transcribeAudio(
            blob,
            version
          );
        };

      setRecordingSeconds(
        0
      );

      recorder.start();
      setPhase("recording");
      // The waveform is optional; an analyser failure must not break recording.
      try { startAnalyser(stream); } catch { stopAnalyser(); }
    } catch (error) {
      recorderRef.current = null;
      streamRef.current = null;
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      stopAnalyser();
      setPhase("prep");
      console.error(
        "Microphone error:",
        error
      );

      setMicrophoneError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access is off. Allow it in your browser settings and try again."
          : "Couldn't start recording. Check your microphone and try again."
      );
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setStartingRecording(false);
    }
  }

  useEffect(() => {
    if (phase === "prep" && focusQuestionRef.current) {
      focusQuestionRef.current = false;
      questionHeadingRef.current?.focus({ preventScroll: true });
      questionHeadingRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [phase, promptIndex, speakingMode]);

  const prepProgress =
    ((PREP_DURATION -
      prepSeconds) /
      PREP_DURATION) *
    100;

  return (
    <div className="session-shell">
      <a className="skip-link" href="#practice-content">Skip to practice</a>
    <main
      className={`session session--${phase}`}
    >
      <header className="session-header">
        <Link href="/" aria-label="Clearly home"><Brand /></Link>

        <button
          className="session-new"
          onClick={
            newPrompt
          }
        >
          {speakingMode === "free" ? "Fresh thought" : "New question"}
          <span aria-hidden="true">↻</span>
        </button>
      </header>

      <div className="session-inner" id="practice-content">
        <div className="workspace-heading"><h1>{phase === "review" ? "One answer. One small improvement." : "A few minutes for a clearer thought."}</h1></div>
        <nav
          className="session-flow"
          aria-label="Session progress"
        >
          <FlowStep
            label="Think"
            state={getStepState(
              "prep"
            )}
          />

          <FlowStep
            label="Speak"
            state={getStepState(
              "recording"
            )}
          />

          <FlowStep
            label="Review"
            state={getStepState(
              "review"
            )}
          />
        </nav>

        {phase === "prep" && (
          <div className="speaking-mode" role="group" aria-label="What would you like to talk about?">
            <button aria-pressed={speakingMode === "question"} onClick={() => changeMode("question")}>Give me a question</button>
            <button aria-pressed={speakingMode === "free"} onClick={() => changeMode("free")}>What’s on my mind</button>
          </div>
        )}

        {phase === "prep" && focus && (
          <aside className="practice-focus" aria-label="Your saved practice focus">
            <div><span className="eyebrow">Your focus for this answer</span><p>{focus}</p></div>
            <button className="text-button" onClick={() => clearFocus()} aria-label="Remove saved focus">×</button>
          </aside>
        )}

        {phase !==
          "review" && (
          <>
            <section className="session-stage">
              <SoundOrb tone={phase === "recording" ? "warm" : "mint"} className="session-orb" />
              <div className="session-question">
                <p className="eyebrow">{speakingMode === "free" ? "Your space to speak" : "Your question"}</p>
                <h2 ref={questionHeadingRef} tabIndex={-1}>
                  {
                    speakingMode === "free" ? "What’s on your mind?" : activePrompt
                  }
                </h2>
                {phase === "prep" && <p className="question-hint">{speakingMode === "free" ? "Start with a thought, a story, or something you’re working through. Follow what matters to you." : questionHint}</p>}
              </div>

              {phase ===
                "prep" && (
                <div className="prep-panel">
                  <span className="eyebrow">Thinking time · optional</span>
                  <div className="prep-count">
                    {formatTime(
                      prepSeconds
                    )}
                  </div>

                  <p className="prep-message">Start whenever you’re ready.</p>

                  <div className="prep-track">
                    <span
                      style={{
                        transform: `scaleX(${
                          prepProgress /
                          100
                        })`,
                      }}
                    />
                  </div>
                </div>
              )}

              {phase ===
                "recording" && (
                <div className="recording-panel">
                  <span className="eyebrow"><span className="recording-dot" /> Recording</span>
                  <p className="recording-time">
                    {formatTime(
                      recordingSeconds
                    )}
                  </p>

                  <Waveform
                    values={
                      waveform
                    }
                  />
                </div>
              )}
            </section>

            <section className="record-control">
              <button
                disabled={startingRecording}
                aria-label={phase === "recording" ? "Stop recording" : startingRecording ? "Starting microphone" : "Start recording"}
                className={`record-button ${
                  phase ===
                  "recording"
                    ? "record-button--active"
                    : ""
                }`}
                onClick={
                  phase ===
                  "recording"
                    ? stopRecording
                    : startRecording
                }
              >
                <span className="record-core" aria-hidden="true">
                  {phase === "recording" ? <span className="stop-icon" /> : <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                </span>
                {phase === "recording" ? "Stop recording" : startingRecording ? "Starting…" : "Start speaking"}
              </button>
              <p className="record-action">{phase === "recording" ? "Take your time. Stop when you’ve landed your point." : "A short answer is enough. Up to 2 minutes."}</p>

              {microphoneError && (
                <p className="microphone-error" role="alert">
                  {
                    microphoneError
                  }
                </p>
              )}
            </section>
            {phase === "prep" && (
              <details className="framework-help">
                <summary>Need a little structure?</summary>
                <p className="framework-intro">Use what helps. You don’t need to cover every step.</p>
            <section className="speaking-framework" aria-label="Speaking framework">
              <FrameworkItem
                title="Point"
                text="Lead with the thought you want them to know."
                example="The short version is ..."
              />

              <FrameworkItem
                title="What happened?"
                text="Share one moment they can picture."
                example="One moment that sticks with me is ..."
              />

              <FrameworkItem
                title="So what?"
                text="Say why it mattered to you."
                example="What I noticed was ..."
              />

              <FrameworkItem
                title="Now what?"
                text="Connect it to what you learned or do now."
                example="These days, I ..."
              />

              <FrameworkItem
                title="Takeaway"
                text="Close with a thought, then invite their view."
                example="What about you?"
              />
            </section>

              </details>
            )}

          </>
        )}

        {phase ===
          "review" && (
          <section className="review">
            <p className="review-question"><span>{speakingMode === "free" ? "Free speaking" : "Your question"}</span>{speakingMode === "free" ? "What’s on your mind?" : activePrompt}</p>
            <div className="review-heading">
              <h2>
                Listen back
              </h2>

              {audioUrl && (
                <Playback
                  src={audioUrl}
                  durationFallback={
                    recordingSeconds
                  }
                />
              )}
            </div>

            <details className="transcript-details" open={!analysis}>
              <summary>{analysis ? "View or edit your transcript" : "Your transcript"}</summary>
            <div className="transcript-section">
              <div className="transcript-heading">
                <span>
                  {transcriptionStatus ===
                  "loading"
                    ? "Transcribing…"
                    : formatTime(
                        recordingSeconds
                      )}
                </span>
              </div>

              <textarea
                id="transcript"
                aria-label="Transcript"
                value={
                  transcript
                }
                onChange={(
                  event
                ) => {
                  invalidateAnalysis();
                  setAnalysisError("");
                  setTranscript(
                    event.target
                      .value
                  );

                  setAnalysis(
                    null
                  );

                  setAnalysisStatus(
                    "idle"
                  );
                }}
                placeholder={
                  transcriptionStatus ===
                  "loading"
                    ? "Listening…"
                    : "Transcript"
                }
                className="transcript-input"
                disabled={
                  transcriptionStatus ===
                  "loading"
                }
              />

              {transcriptionError && (
                <p className="inline-error" role="alert">
                  {transcriptionError}
                  {audioUrl && (
                    <button type="button" className="text-button" onClick={() => {
                      const blob = audioBlobRef.current;
                      if (blob) void transcribeAudio(blob, requestVersionRef.current);
                    }}>Retry transcription</button>
                  )}
                </p>
              )}

              <div className="analyse-row">
                <button
                  aria-label="Get feedback"
                  onClick={
                    analyseResponse
                  }
                  disabled={
                    !transcript.trim() ||
                    transcriptionStatus ===
                      "loading" ||
                    analysisStatus ===
                      "loading"
                  }
                  className="analyse-button"
                >
                  {analysisStatus ===
                  "loading"
                    ? "Finding your feedback…"
                    : analysisStatus === "error" ? "Try feedback again" : "Get feedback"}

                  <span>→</span>
                </button>
              </div>

              {analysisError && (
                <p className="inline-error analysis-error" role="alert">
                  {
                    analysisError
                  }
                </p>
              )}
            </div>

            </details>
            {analysis && (
              <>
                <AnalysisResults analysis={analysis} deliveryStats={deliveryStats} savedFocus={focus} onSaveFocus={() => {
                  const saved = saveFocus(analysis.improve);
                  setFocusStatus(saved ? "Tip saved on this device for your next practice." : "Your browser couldn’t save the tip. You can still try it in your next answer.");
                }} />
                <p className="focus-status" role="status">{focusStatus}</p>
                <section className="practice-next" aria-label="Keep practising">
                  <div><h2>That’s one answer practised.</h2><p>Try the tip in a fresh answer, or give this one another go.</p></div>
                  <div className="practice-next-actions">
                    <button className="button button--dark" onClick={newPrompt}>{speakingMode === "free" ? "Another thought" : "Next question"} <span aria-hidden="true">→</span></button>
                    <button className="button button--outline" onClick={retryPrompt}>{speakingMode === "free" ? "Try this thought again" : "Try this question again"}</button>
                  </div>
                </section>
              </>
            )}
          </section>
        )}
      </div>
    </main>
    </div>
  );
}

function AnalysisResults({
  analysis,
  savedFocus,
  deliveryStats,
  onSaveFocus,
}: {
  analysis: Analysis;
  savedFocus: string | null;
  deliveryStats: DeliveryStats | null;
  onSaveFocus: () => void;
}) {
  const headlineRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headlineRef.current?.focus({ preventScroll: true });
    headlineRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, []);

  const steps = [
    [
      "Point",
      analysis
        .framework
        .openingPoint,
    ],

    [
      "What happened?",
      analysis
        .framework.what,
    ],

    [
      "So what?",
      analysis
        .framework.soWhat,
    ],

    [
      "Now what?",
      analysis
        .framework.nowWhat,
    ],

    [
      "Takeaway",
      analysis
        .framework
        .closingPoint,
    ],
  ] as const;

  return (
    <section className="analysis-results">
      <p className="eyebrow">Your feedback</p>
      <div className="analysis-lead">
        <h2 ref={headlineRef} tabIndex={-1}>
          {
            analysis.headline
          }
        </h2>
      </div>

      <div className="analysis-observations">
        <div>
          <span>
            What worked
          </span>

          <p>
            {
              analysis.strongest
            }
          </p>
        </div>

        <div>
          <span>
            One thing to try
          </span>

          <p>
            {
              analysis.improve
            }
          </p>
          <button className="text-button save-focus" onClick={onSaveFocus} disabled={savedFocus === analysis.improve}>
            {savedFocus === analysis.improve ? "Saved for next time ✓" : "Save this tip for next time"}
          </button>
        </div>
      </div>

      <details className="feedback-details" open>
        <summary>Look closer at your answer</summary>
        <div className="analysis-score">
          <div>
            {
              analysis.score
            }
          </div>

          <span>
            {
              analysis.label
            }
          </span>
        </div>

      <div className="framework-review">
        {steps.map(
          ([
            label,
            item,
          ], index) => (
            <div
              key={`${label}-${index}`}
              className="framework-review-item"
            >
              <div className="framework-review-top">
                <span>
                  {label}
                </span>

                <i
                  role="img"
                  aria-label={`Status: ${item.status}`}
                  className={`framework-status framework-status--${item.status}`}
                />
              </div>

              <p>
                {item.note}
              </p>
            </div>
          )
        )}
      </div>

      <SpeechStatistics metrics={analysis.metrics} deliveryStats={deliveryStats} />
      <div className="analysis-bottom">
        <div className="analysis-rewrite">
          <h3>Try this response</h3>
          {analysis.suggestedResponse && analysis.suggestionScore !== null ? (
            <>
              <span className="suggestion-score">Model-estimated {analysis.suggestionScore}/100 · checked against the same rubric</span>
              <p className="suggested-response">{analysis.suggestedResponse}</p>
              <p className="suggestion-reason">{analysis.suggestionReason}</p>
            </>
          ) : <p className="suggestion-reason">A 90+ rewrite couldn’t be verified this time. Your feedback is still ready to use; you can request feedback again to retry the suggestion.</p>}
        </div>
      </div>
      </details>
    </section>
  );
}

function SpeechStatistics({ metrics, deliveryStats }: { metrics: ReturnType<typeof speechMetrics>; deliveryStats: DeliveryStats | null }) {
  const cards = [
    ["Speaking rate", metrics.wordsPerMinute === null ? "Not available" : `${metrics.wordsPerMinute} WPM`, "Approximate, using transcript and full recording time"],
    ["Words", `${metrics.wordCount}`, "In the current transcript"],
    ["Filler words", `${metrics.fillerCount}`, metrics.fillers.length ? metrics.fillers.map(item => `${item.word} × ${item.count}`).join(", ") : "No um / uh / erm / er / hmm detected"],
    ["Fillers per 100 words", `${metrics.fillersPer100Words}`, "Transcript-based; transcription can omit fillers"],
    ["Repeated words", `${metrics.repeatedWords}`, "Consecutive repetitions; these can be intentional"],
    ["Energy", deliveryStats?.energyRangeDb == null ? "Not measured" : `${deliveryStats.energyRangeDb} dB range`, "Variation in relative microphone level"],
    ["Tonality", deliveryStats?.pitchRangeSemitones == null ? "Not measured" : `${deliveryStats.pitchRangeSemitones} semitones`, "Pitch variation in detected voiced audio"],
    ["Quiet samples", deliveryStats?.quietPercent == null ? "Not measured" : `${deliveryStats.quietPercent}%`, "Low-level audio samples; an estimate of pauses"],
  ];
  return <section className="speech-statistics" aria-label="Speaking statistics">
    <h3>Your speaking statistics</h3>
    <dl className="statistics-grid">{cards.map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><p>{note}</p></div>)}</dl>
    <p className="statistics-note">Audio statistics are sampled on this device while recording. Room noise, microphone processing and background tabs can affect them. They describe variation, not emotion, confidence or personality.</p>
  </section>;
}

function FlowStep({
  label,
  state,
}: {
  label: string;

  state:
    | "active"
    | "complete"
    | "waiting";
}) {
  return (
    <div
      className={`flow-step flow-step--${state}`}
      aria-current={state === "active" ? "step" : undefined}
    >
      <span className="flow-number" aria-hidden="true">{state === "complete" ? "✓" : ({ Think: "01", Speak: "02", Review: "03" }[label])}</span>
      <span>{label}</span>

      <div className="flow-line">
        <span />
      </div>
    </div>
  );
}

function FrameworkItem({
  title,
  text,
  example,
}: {
  title: string;
  text: string;
  example: string;
}) {
  return (
    <div className="framework-item">
      <h2>
        {title}
      </h2>

      <p>
        {text}
      </p>

      <p className="framework-example">
        <span className="framework-example-label">Try</span>
        {" "}
        {example}
      </p>
    </div>
  );
}

function Waveform({
  values,
}: {
  values: number[];
}) {
  return (
    <div
      className="session-waveform"
      aria-hidden="true"
    >
      {values.map(
        (
          height,
          index
        ) => (
          <span
            key={index}
            style={{
              height: `${height}%`,
            }}
          />
        )
      )}
    </div>
  );
}

function Playback({
  src,
  durationFallback,
}: {
  src: string;
  durationFallback: number;
}) {
  const audioRef =
    useRef<
      HTMLAudioElement
    >(null);

  const [
    playing,
    setPlaying,
  ] =
    useState(false);

  const [
    current,
    setCurrent,
  ] =
    useState(0);

  const [
    duration,
    setDuration,
  ] =
    useState(
      durationFallback
    );

  function toggle() {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    if (
      audio.paused
    ) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  const progress =
    duration > 0
      ? (current /
          duration) *
        100
      : 0;

  return (
    <div className="playback">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() =>
          setPlaying(true)
        }
        onPause={() =>
          setPlaying(false)
        }
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(
          event
        ) =>
          setCurrent(
            event
              .currentTarget
              .currentTime
          )
        }
        onLoadedMetadata={(
          event
        ) => {
          const next =
            event
              .currentTarget
              .duration;

          if (
            Number.isFinite(
              next
            )
          ) {
            setDuration(
              next
            );
          }
        }}
      />

      <button
        onClick={toggle}
        className="playback-button"
        aria-label={
          playing
            ? "Pause"
            : "Play"
        }
      >
        {playing
          ? "Ⅱ"
          : "▶"}
      </button>

      <input
        type="range"
        className="playback-track"
        aria-label="Playback position"
        aria-valuetext={`${formatTime(Math.floor(current))} of ${formatTime(Math.floor(duration))}`}
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(current, duration)}
        disabled={!duration}
        style={{ "--playback-progress": `${progress}%` } as React.CSSProperties}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (audioRef.current) audioRef.current.currentTime = next;
          setCurrent(next);
        }}
      />

      <span className="playback-time">
        {formatTime(
          Math.floor(
            current
          )
        )}
      </span>
    </div>
  );
}