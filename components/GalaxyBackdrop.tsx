import MoneyFlutter from "@/components/MoneyFlutter";

/**
 * Decorative galaxy layer behind the whole app: nebula clouds, noise smoke,
 * stars, and still 10,000 kyat notes and ledgers. Static markup (server
 * component); motion lives in globals.css.
 */
export default function GalaxyBackdrop() {
  return (
    // Positioning is inline as well as in CSS: even if a stylesheet fails to
    // load, this layer must never take up space and push the app down.
    <div
      className="galaxy"
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none" }}
    >
      <div className="nebula nebula-1" />
      <div className="nebula nebula-2" />
      <div className="nebula nebula-3" />
      <div className="nebula nebula-4" />
      <Smoke id="smoke-a" className="smoke" seed={7} frequency="0.0035 0.0065" color={[0.49, 0.29, 0.93]} opacity={0.55} />
      <Smoke id="smoke-b" className="smoke smoke-2" seed={23} frequency="0.0055 0.0028" color={[0.85, 0.36, 0.89]} opacity={0.35} />
      <div className="stars" />
      <div className="stars stars-2" />
      <MoneyFlutter />
      <div className="galaxy-haze" />
    </div>
  );
}

/**
 * Fractal noise tinted to one colour, with the noise driving alpha so only the
 * densest wisps show — reads as drifting smoke rather than a flat wash.
 */
function Smoke({
  id,
  className,
  seed,
  frequency,
  color: [r, g, b],
  opacity,
}: {
  id: string;
  className: string;
  seed: number;
  frequency: string;
  color: [number, number, number];
  opacity: number;
}) {
  return (
    <svg className={className} style={{ opacity }} preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <filter id={id} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={frequency} numOctaves={4} seed={seed} />
        <feColorMatrix
          values={`0 0 0 0 ${r}
                   0 0 0 0 ${g}
                   0 0 0 0 ${b}
                   2.6 0 0 0 -1.05`}
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}
