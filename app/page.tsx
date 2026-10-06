"use client";

import Link from "next/link";
import { questions } from "@/lib/questions";
import { Brand } from "@/components/brand";
import { SoundOrb } from "@/components/sound-orb";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const previewStages = [
  { title: "Think", label: "Find your point.", description: "One question. A moment to gather your thoughts. A simple structure to make them land.", tone: "mint", time: "01:30", hint: "A little room to think" },
  { title: "Speak", label: "Make it your own.", description: "Say it out loud, in your own words. No scripts, no perfect takes. Just you and a good question.", tone: "warm", time: "02:00", hint: "Your voice, your perspective" },
  { title: "Review", label: "Hear what worked.", description: "Read your transcript, listen back, and take one useful thing into your next conversation.", tone: "violet", time: "One", hint: "Small improvements add up" },
] as const;

const waveform = [18, 35, 26, 60, 42, 75, 54, 32, 66, 86, 50, 72, 40, 62, 28, 47, 79, 58, 34, 68, 45, 24, 55, 38];

export default function Home() {
  const router = useRouter();
  const [previewStage, setPreviewStage] = useState(1);
  const preview = previewStages[previewStage];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
        const data = await response.json().catch(() => null);
        setError(response.status === 401 ? "Not quite." : data?.error || "Couldn't sign in. Try again.");
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
    <main className="landing" id="top">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="announcement"><span className="status-dot" /> A little practice. A clearer conversation.</div>
      <header className="site-header">
        <Link href="/" aria-label="Clearly home"><Brand /></Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#the-method">The method</a>
        </nav>
        <button className="button button--outline" onClick={openGate}>Log in <span aria-hidden="true">↗</span></button>
      </header>

      <div id="main-content" className="landing-content">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="tiny-wave" aria-hidden="true">ıııı</span> A space to practise speaking</p>
            <h1 id="hero-title">Speak clearly.<br />Be understood.</h1>
            <div className="hero-actions">
              <button className="button button--dark" onClick={openGate}>Start practising <span aria-hidden="true">↗</span></button>
              <a className="button button--outline" href="#how-it-works">See how it works</a>
            </div>
          </div>
          <p className="hero-description">Good conversations start with a clear thought. Find yours with a question, a moment to think, and a little practice out loud.</p>
        </section>

        <section className="practice-preview" aria-label="Preview the practice experience">
          <div className="preview-tabs" role="tablist" aria-label="Practice stages">
            {previewStages.map((stage, index) => (
              <button key={stage.title} id={`preview-tab-${index}`} role="tab" aria-selected={previewStage === index}
                aria-controls="preview-panel" tabIndex={previewStage === index ? 0 : -1}
                ref={(element) => { tabRefs.current[index] = element; }}
                onClick={() => setPreviewStage(index)}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === "ArrowRight") next = (index + 1) % previewStages.length;
                  else if (event.key === "ArrowLeft") next = (index + previewStages.length - 1) % previewStages.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = previewStages.length - 1;
                  else return;
                  event.preventDefault(); setPreviewStage(next); tabRefs.current[next]?.focus();
                }}>
                <SoundOrb tone={stage.tone} className="tab-orb" />{stage.title}<span className="tab-number">0{index + 1}</span>
              </button>
            ))}
          </div>
          <div className="preview-panel" id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${previewStage}`} tabIndex={0}>
            <div className="preview-note"><span className="eyebrow">0{previewStage + 1} / {preview.title}</span><h2>{preview.label}</h2><p>{preview.description}</p></div>
            <div className="orb-scene">
              <SoundOrb tone="mint" className="scene-orb scene-orb--left" />
              <SoundOrb tone={preview.tone} className="scene-orb scene-orb--main" />
              <SoundOrb tone="violet" className="scene-orb scene-orb--right" />
              <div className="orb-caption"><span>{preview.time}</span><p>{preview.hint}</p></div>
            </div>
            <div className="preview-example">
              <div className="example-heading"><span className="eyebrow">{previewStage === 2 ? "A useful observation" : "Your question"}</span><span className="example-dot" /></div>
              <p>{previewStage === 2 ? "Strong opening. Get to the example sooner." : questions[9]}</p>
              {previewStage === 1 ? <div className="preview-waveform" aria-hidden="true">{waveform.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div>
                : <div className="preview-chips">{(previewStage === 0 ? ["Point", "What", "So what", "Now what"] : ["Clarity", "Structure", "Concision"]).map(label => <span key={label}>{label}</span>)}</div>}
              <span className="example-footer">{previewStage === 2 ? "One thing to take into your next conversation." : "No perfect answers. Just your perspective."}</span>
            </div>
          </div>
          <div className="preview-bottom"><span>Think. Speak. Review.</span><button className="text-button" onClick={openGate}>Try a session <span aria-hidden="true">↗</span></button></div>
        </section>

        <section className="how-section" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading"><h2 id="how-title">A small habit.<br />A noticeable difference.</h2><p>A few minutes to practise being understood.<br />One answer at a time.</p></div>
          <div className="step-cards">
            {previewStages.map((stage, index) => <article className="step-card" key={stage.title}>
              <div className="step-card-top"><SoundOrb tone={stage.tone} /><span>0{index + 1}</span></div>
              <h3>{stage.title}.</h3><p>{stage.description}</p><span className="step-detail">{["90 seconds to prepare", "Up to 2 minutes to speak", "A transcript and useful feedback"][index]}</span>
            </article>)}
          </div>
        </section>

        <section className="method-section" id="the-method" aria-labelledby="method-title">
          <div className="method-copy"><p className="eyebrow">A little structure goes a long way</p><h2 id="method-title">Give your thoughts<br />somewhere to go.</h2><p>Lead with your point. Share a moment. Say why it matters. Bring it back to the conversation.</p><span className="method-note">A helpful scaffold, never a script.</span></div>
          <ol className="method-list">{[
            ["Point", "Lead with what you want them to know."],
            ["What happened?", "Share a moment they can picture."],
            ["So what?", "Say why it mattered to you."],
            ["Now what?", "Connect it to what you learned."],
            ["Takeaway", "Land the thought. Invite their view."],
          ].map(([title, description], index) => <li key={title}><span className="method-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div><span aria-hidden="true">↗</span></li>)}</ol>
        </section>

        <section className="closing-section"><SoundOrb tone="violet" /><div><p className="eyebrow">Your next good conversation starts here</p><h2>Make yourself understood.</h2><button className="button button--dark" onClick={openGate}>Start practising <span aria-hidden="true">↗</span></button></div></section>
      </div>
      <footer className="site-footer"><Link href="/" aria-label="Clearly home"><Brand /></Link><span>Think. Speak. Review.</span><span>© {new Date().getFullYear()} Clearly</span></footer>

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

            <Brand />
            <h2 id="gate-title">Welcome to Clearly</h2>
            <p className="gate-description">A little practice for your next conversation.</p>

            <form onSubmit={handleAccess}>
              <label className="gate-label" htmlFor="beta-password">Beta password</label>
              <div className="password-row">
                <input
                  id="beta-password"
                  ref={passwordRef}
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Enter your beta password"
                  aria-label="Password"
                />

                <button
                  type="submit"
                  disabled={
                    loading || !password.trim()
                  }
                  aria-label="Enter"
                >
                  {loading ? "Signing in…" : "Continue"}
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