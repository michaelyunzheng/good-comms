export type OrbTone = "warm" | "violet" | "mint";

export function SoundOrb({ tone = "warm", className = "" }: { tone?: OrbTone; className?: string }) {
  return (
    <span className={`sound-orb sound-orb--${tone} ${className}`} aria-hidden="true">
      <span className="sound-orb-colour" />
      <span className="sound-orb-grain" />
      <span className="sound-orb-light" />
    </span>
  );
}
