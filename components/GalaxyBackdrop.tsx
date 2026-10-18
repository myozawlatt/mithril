import MoneyFlutter from "@/components/MoneyFlutter";
import Smoke from "@/components/Smoke";

/**
 * Decorative galaxy layer behind the whole app: nebula clouds, noise smoke,
 * stars, and still 10,000 kyat notes and ledgers. Static markup (server
 * component) apart from the smoke, which is drawn on the client; motion lives
 * in globals.css and pauses while a sheet is open.
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
      <Smoke className="smoke" seed={7} frequency="0.0035 0.0065" color={[0.49, 0.29, 0.93]} opacity={0.55} />
      <Smoke className="smoke smoke-2" seed={23} frequency="0.0055 0.0028" color={[0.85, 0.36, 0.89]} opacity={0.35} />
      <div className="stars" />
      <div className="stars stars-2" />
      <MoneyFlutter />
      <div className="galaxy-haze" />
    </div>
  );
}
