"use client";

import { useEffect, useState } from "react";

type Props = {
  className: string;
  seed: number;
  frequency: string;
  color: [number, number, number];
  opacity: number;
};

/**
 * Fractal noise tinted to one colour, with the noise driving alpha so only the
 * densest wisps show — reads as drifting smoke rather than a flat wash.
 *
 * Drawn once into a bitmap. A live SVG filter re-runs the noise whenever the
 * viewport changes size (the phone keyboard opening, for one), which stalled
 * every sheet that focuses an input. A bitmap only rescales. 1 CSS px per pixel
 * is plenty: the smoke is soft, and the noise scale stays in CSS px as before.
 */
export default function Smoke({ className, seed, frequency, color: [r, g, b], opacity }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    // Size of the .smoke layer: 150% of the viewport each way.
    const w = Math.ceil(window.innerWidth * 1.5);
    const h = Math.ceil(window.innerHeight * 1.5);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<filter id="f" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="4" seed="${seed}"/>` +
      `<feColorMatrix values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 2.6 0 0 0 -1.05"/>` +
      `</filter><rect width="100%" height="100%" filter="url(#f)"/></svg>`;
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    // After first paint, so drawing the noise never delays the app showing.
    const start = () => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return setSrc(svgUrl);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (cancelled) return;
          if (!blob) return setSrc(svgUrl);
          url = URL.createObjectURL(blob);
          setSrc(url);
        });
      };
      // Fall back to the SVG itself; it still looks right, just costs more on resize.
      img.onerror = () => !cancelled && setSrc(svgUrl);
      img.src = svgUrl;
    };
    const idle = window.requestIdleCallback?.(start, { timeout: 1000 });
    const timer = idle === undefined ? window.setTimeout(start, 200) : undefined;

    return () => {
      cancelled = true;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [seed, frequency, r, g, b]);

  return (
    <div
      className={className}
      style={{
        opacity: src ? opacity : 0,
        transition: "opacity 1.2s ease-out",
        backgroundImage: src ? `url("${src}")` : undefined,
        backgroundSize: "100% 100%",
      }}
    />
  );
}
