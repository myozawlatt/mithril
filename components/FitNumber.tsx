/** Approximate rendered width of a formatted number, in em (tabular digits). */
function widthEm(text: string): number {
  const digits = text.replace(/\D/g, "").length;
  const separators = text.length - digits;
  return digits * 0.62 + separators * 0.3 + 0.1;
}

/**
 * A large number that shrinks to its container's width instead of truncating.
 * The parent must establish an inline-size container (`@container`).
 */
export default function FitNumber({ text, maxRem, className = "" }: { text: string; maxRem: number; className?: string }) {
  return (
    <p
      className={`whitespace-nowrap font-semibold leading-none tracking-tight ${className}`}
      style={{ fontSize: `min(${maxRem}rem, calc(100cqi / ${widthEm(text).toFixed(2)}))` }}
    >
      {text}
    </p>
  );
}
