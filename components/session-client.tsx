"use client";

import Link from "next/link";

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

  betterOpening: string;

  metrics: {
    wordCount: number;
    wordsPerMinute:
      | number
      | null;
  };

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

const prompts = [
  "What everyday thing deserves a much bigger fan club?",

  "What's something you know a surprising amount about?",

  "If you could add one harmless rule everyone had to follow, what would it be?",

  "What small invention would make your day noticeably better?",

  "What's a boring thing you find weirdly fascinating?",

  "Which fictional gadget would you most like to borrow for a week?",

  "What's a tiny moment that can turn an ordinary day around?",

  "What skill looks like magic until you learn how it works?",
];

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

export default function SessionClient() {
  const [
    phase,
    setPhase,
  ] =
    useState<Phase>("prep");

  const [
    promptIndex,
    setPromptIndex,
  ] =
    useState(0);

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

        analyser.fftSize =
          128;

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

        function draw(
          timestamp: number
        ) {
          const active =
            analyserRef.current;

          if (!active) {
            return;
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
                prompt:
                  prompts[
                    promptIndex
                  ],

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

  function getPrepMessage() {
    if (
      prepSeconds === 0
    ) {
      return "Take your time. Start when ready.";
    }

    if (
      prepSeconds <= 10
    ) {
      return "One easy breath, then your first point.";
    }

    if (
      prepSeconds <= 30
    ) {
      return "Choose one detail they can picture.";
    }

    if (
      prepSeconds <= 60
    ) {
      return "Picture one person you're talking with.";
    }

    return "Let your shoulders soften. Find your point.";
  }

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

  function newPrompt() {
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

    setPromptIndex(
      (current) => {
        if (
          prompts.length <=
          1
        ) {
          return current;
        }

        let next =
          current;

        while (
          next === current
        ) {
          next =
            Math.floor(
              Math.random() *
                prompts.length
            );
        }

        return next;
      }
    );

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

  async function startRecording() {
    if (startingRef.current || recorderRef.current?.state === "recording") return;
    startingRef.current = true;
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

  const prepProgress =
    ((PREP_DURATION -
      prepSeconds) /
      PREP_DURATION) *
    100;

  return (
    <main
      className={`session session--${phase}`}
    >
      <header className="session-header">
        <Link
          href="/"
          className="wordmark"
        >
          clearly
          <span>°</span>
        </Link>

        <button
          className="session-new"
          onClick={
            newPrompt
          }
        >
          New
          <span>↻</span>
        </button>
      </header>

      <div className="session-inner">
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

        {phase !==
          "review" && (
          <>
            <section className="session-stage">
              <div className="session-question">
                <h1>
                  {
                    prompts[
                      promptIndex
                    ]
                  }
                </h1>
              </div>

              {phase ===
                "prep" && (
                <div className="prep-panel">
                  <div className="prep-count">
                    {formatTime(
                      prepSeconds
                    )}
                  </div>

                  <p
                    key={getPrepMessage()}
                    className="prep-message"
                  >
                    {getPrepMessage()}
                  </p>

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

            <section className="speaking-framework">
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
                <span className="record-halo record-halo--outer" />
                <span className="record-halo record-halo--inner" />

                <span className="record-core">
                  {phase ===
                  "recording" ? (
                    <span className="stop-icon" />
                  ) : (
                    <span className="record-icon" />
                  )}
                </span>
              </button>

              <p className="record-action">
                {phase ===
                "recording"
                  ? "Stop"
                  : startingRecording ? "Starting…" : "Speak"}
              </p>

              {microphoneError && (
                <p className="microphone-error" role="alert">
                  {
                    microphoneError
                  }
                </p>
              )}
            </section>
          </>
        )}

        {phase ===
          "review" && (
          <section className="review">
            <div className="review-heading">
              <h2>
                Your answer
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

            <div className="transcript-section">
              <div className="transcript-heading">
                <h3>
                  Transcript
                </h3>

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
                    ? "Reading…"
                    : "Analyse"}

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

            {analysis && (
              <AnalysisResults
                analysis={
                  analysis
                }
              />
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function AnalysisResults({
  analysis,
}: {
  analysis: Analysis;
}) {
  const steps = [
    [
      "Point",
      analysis
        .framework
        .openingPoint,
    ],

    [
      "What",
      analysis
        .framework.what,
    ],

    [
      "So what",
      analysis
        .framework.soWhat,
    ],

    [
      "Now what",
      analysis
        .framework.nowWhat,
    ],

    [
      "Point",
      analysis
        .framework
        .closingPoint,
    ],
  ] as const;

  return (
    <section className="analysis-results">
      <div className="analysis-lead">
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

        <h2>
          {
            analysis.headline
          }
        </h2>
      </div>

      <div className="analysis-observations">
        <div>
          <span>
            Strongest
          </span>

          <p>
            {
              analysis.strongest
            }
          </p>
        </div>

        <div>
          <span>
            Next
          </span>

          <p>
            {
              analysis.improve
            }
          </p>
        </div>
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

      <div className="analysis-bottom">
        <div className="analysis-rewrite">
          <span>Try</span>

          <p>
            “
            {
              analysis.betterOpening
            }
            ”
          </p>
        </div>

        <div className="analysis-metrics">
          <span>
            {
              analysis.metrics
                .wordCount
            }{" "}
            words
          </span>

          {analysis.metrics
            .wordsPerMinute && (
            <span>
              {
                analysis.metrics
                  .wordsPerMinute
              }{" "}
              wpm
            </span>
          )}
        </div>
      </div>
    </section>
  );
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
    >
      <span>
        {label}
      </span>

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