"use client";

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
  "Tell me about something you were completely wrong about.",

  "What is something most people misunderstand?",

  "Tell me about a decision that changed the direction of your life.",

  "Explain something complicated in a way anyone could understand.",

  "What is an opinion you have changed recently?",

  "Tell me about a difficult problem you had to solve.",
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

  const recorderRef =
    useRef<
      MediaRecorder | null
    >(null);

  const streamRef =
    useRef<
      MediaStream | null
    >(null);

  const chunksRef =
    useRef<Blob[]>([]);

  const audioUrlRef =
    useRef<
      string | null
    >(null);

  const discardRecordingRef =
    useRef(false);

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

        audioContextRef.current =
          context;

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
          }
        );

      const data =
        await response.json();

      if (
        version !==
        requestVersionRef.current
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Transcription failed"
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
        version !==
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
        "Couldn't transcribe."
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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Analysis failed"
        );
      }

      setAnalysis(data);

      setAnalysisStatus(
        "ready"
      );
    } catch (error) {
      console.error(
        error
      );

      setAnalysisStatus(
        "error"
      );

      setAnalysisError(
        "Couldn't analyse this one."
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
          setRecordingSeconds(
            (current) =>
              current + 1
          );
        },
        1000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [phase]);

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
    return () => {
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
      return "Ready when you are.";
    }

    if (
      prepSeconds <= 10
    ) {
      return "Know the ending.";
    }

    if (
      prepSeconds <= 30
    ) {
      return "Why does it matter?";
    }

    if (
      prepSeconds <= 60
    ) {
      return "Pick the example.";
    }

    return "Find the point.";
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
    requestVersionRef.current +=
      1;

    const recorder =
      recorderRef.current;

    if (
      recorder?.state ===
      "recording"
    ) {
      discardRecordingRef.current =
        true;

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

    setPhase("prep");
  }

  async function startRecording() {
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

      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
          }
        );

      streamRef.current =
        stream;

      const recorder =
        new MediaRecorder(
          stream
        );

      recorderRef.current =
        recorder;

      chunksRef.current =
        [];

      discardRecordingRef.current =
        false;

      recorder.ondataavailable =
        (event) => {
          if (
            event.data
              .size > 0
          ) {
            chunksRef.current.push(
              event.data
            );
          }
        };

      recorder.onstop =
        () => {
          stopAnalyser();

          stream
            .getTracks()
            .forEach(
              (track) =>
                track.stop()
            );

          if (
            discardRecordingRef.current
          ) {
            discardRecordingRef.current =
              false;

            chunksRef.current =
              [];

            return;
          }

          const blob =
            new Blob(
              chunksRef.current,
              {
                type:
                  recorder.mimeType,
              }
            );

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

          const version =
            requestVersionRef.current;

          void transcribeAudio(
            blob,
            version
          );
        };

      setRecordingSeconds(
        0
      );

      setPhase(
        "recording"
      );

      startAnalyser(
        stream
      );

      recorder.start();
    } catch (error) {
      console.error(
        "Microphone error:",
        error
      );

      setMicrophoneError(
        "Microphone access is off."
      );
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
        <a
          href="/"
          className="wordmark"
        >
          clearly
          <span>°</span>
        </a>

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

            <section
              className={`speaking-framework ${
                phase ===
                "recording"
                  ? "speaking-framework--quiet"
                  : ""
              }`}
            >
              <FrameworkItem
                title="Point"
                text="Lead."
              />

              <FrameworkItem
                title="What"
                text="What happened?"
              />

              <FrameworkItem
                title="So what"
                text="Why it mattered."
              />

              <FrameworkItem
                title="Now what"
                text="What changed?"
              />

              <FrameworkItem
                title="Point"
                text="Land it."
              />
            </section>

            <section className="record-control">
              <button
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
                  : "Speak"}
              </p>

              {microphoneError && (
                <p className="microphone-error">
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
                value={
                  transcript
                }
                onChange={(
                  event
                ) => {
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
                <p className="inline-error">
                  {
                    transcriptionError
                  }
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
                <p className="inline-error analysis-error">
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
          ]) => (
            <div
              key={
                label +
                item.note
              }
              className="framework-review-item"
            >
              <div className="framework-review-top">
                <span>
                  {label}
                </span>

                <i
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
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="framework-item">
      <h2>
        {title}
      </h2>

      <p>
        {text}
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
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seek(
    event:
      React.MouseEvent<HTMLDivElement>
  ) {
    const audio =
      audioRef.current;

    if (
      !audio ||
      !duration
    ) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const ratio =
      Math.max(
        0,
        Math.min(
          1,
          (event.clientX -
            rect.left) /
            rect.width
        )
      );

    audio.currentTime =
      ratio *
      duration;
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

      <div
        className="playback-track"
        onClick={seek}
      >
        <span
          style={{
            transform: `scaleX(${
              progress /
              100
            })`,
          }}
        />
      </div>

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