"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const waveform = [
  22, 38, 61, 35, 74, 48, 26, 63, 88,
  45, 71, 33, 58, 78, 41, 28, 54, 70,
  38, 64, 31, 20, 47, 76, 50, 28, 67,
  42, 24, 55, 73, 43, 60, 32, 19,
];

export default function Home() {
  const router = useRouter();

  const [gateOpen, setGateOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const gateRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  function openGate() {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setError("");
    setGateOpen(true);
  }

  function closeGate() {
    setGateOpen(false);
  }

  useEffect(() => {
    if (!gateOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      passwordRef.current?.focus();
    });

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeGate();
        return;
      }

      if (event.key !== "Tab" || !gateRef.current) {
        return;
      }

      const focusable =
        gateRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);

      previousFocusRef.current?.focus();
    };
  }, [gateOpen]);

  async function handleAccess(event: FormEvent) {
    event.preventDefault();

    if (!password.trim() || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Not quite.");
        return;
      }

      router.push("/session");
    } catch {
      setError("Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing">
      <header className="site-header">
        <a
          className="wordmark"
          href="/"
          aria-label="Clearly home"
        >
          clearly<span>°</span>
        </a>

        <button
          className="text-button"
          onClick={openGate}
        >
          Enter
        </button>
      </header>

      <section className="hero">
        <div className="hero-aura" />

        <div className="hero-copy">
          <h1>
            <span>Speak clearly.</span>
            <em>Be understood.</em>
          </h1>

          <p>
            Practice out loud.
            <br />
            See what worked.
          </p>
        </div>

        <button
          className="voice-object"
          onClick={openGate}
          aria-label="Start"
        >
          <span className="voice-ring voice-ring--outer" />
          <span className="voice-ring voice-ring--inner" />

          <span className="voice-core">
            <span className="record-dot" />
          </span>

          <span className="voice-label">
            Start
          </span>
        </button>
      </section>

      <section className="product-section">
        <div className="product-intro">
          <h2>
            Think.
            <br />
            Speak.
            <br />
            Review.
          </h2>

          <p>
            One question.
            <br />
            One take.
            <br />
            Useful feedback.
          </p>
        </div>

        <div className="product-preview">
          <div className="signal-line" />

          <div className="preview-prompt">
            <span className="preview-label">
              Prompt
            </span>

            <p>
              Tell me about something
              <br />
              you changed your mind about.
            </p>

            <div className="preview-framework">
              <span>Point</span>
              <span>What</span>
              <span>So what</span>
              <span>Now what</span>
              <span>Point</span>
            </div>
          </div>

          <div className="preview-response">
            <div className="response-top">
              <span>01:12</span>
            </div>

            <div
              className="preview-waveform"
              aria-hidden="true"
            >
              {waveform.map((height, index) => (
                <span
                  key={index}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>

            <p className="sample-transcript">
              I used to think changing your mind meant
              you had been wrong. Now I think it often
              means you finally have enough information
              to see the problem clearly.
            </p>
          </div>

          <div className="preview-feedback">
            <span className="preview-label">
              Feedback
            </span>

            <p className="feedback-main">
              Strong opening.
              <br />
              Get to the example sooner.
            </p>

            <div className="feedback-metrics">
              <div>
                <span>Clarity</span>
                <strong>Strong</strong>
              </div>

              <div>
                <span>Structure</span>
                <strong>Clear</strong>
              </div>

              <div>
                <span>Concision</span>
                <strong>Tighten</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="final-section">
        <div className="final-aura" />

        <h2>
          Get clearer.
        </h2>

        <button
          className="primary-button"
          onClick={openGate}
        >
          Start
          <span>↗</span>
        </button>
      </section>

      <footer className="site-footer">
        <a className="wordmark" href="/">
          clearly<span>°</span>
        </a>

        <span>2026</span>
      </footer>

      {gateOpen && (
        <div
          className="gate-backdrop"
          onMouseDown={closeGate}
        >
          <div
            ref={gateRef}
            className="gate"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gate-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="gate-close"
              onClick={closeGate}
              aria-label="Close"
            >
              ×
            </button>

            <h2 id="gate-title">
              Enter.
            </h2>

            <form onSubmit={handleAccess}>
              <div className="password-row">
                <input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Password"
                  aria-label="Password"
                />

                <button
                  type="submit"
                  disabled={
                    loading || !password.trim()
                  }
                  aria-label="Enter"
                >
                  {loading ? "·" : "→"}
                </button>
              </div>

              <div
                className="gate-status"
                aria-live="polite"
              >
                {error}
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}