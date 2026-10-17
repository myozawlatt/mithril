"use client";

import { useRef, useState, type ReactNode } from "react";

type Props = {
  onTap: () => void;
  onDelete: () => void;
  children: ReactNode;
};

/** Fraction of the row width a left swipe must pass to delete. */
const DELETE_AT = 0.35;
/** Movement before we decide between horizontal swipe and vertical scroll. */
const SLOP = 8;

/**
 * Swipe left to delete; tap to open. Vertical scrolling is left to the
 * browser (`touch-action: pan-y`), so only horizontal drags are captured.
 */
export default function SwipeRow({ onTap, onDelete, children }: Props) {
  const [dx, setDx] = useState(0);
  const [width, setWidth] = useState(1);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const swiped = useRef(false);

  const progress = Math.min(1, -dx / (width * DELETE_AT));
  const armed = progress >= 1;

  function release() {
    const horizontal = gesture.current?.axis === "x";
    gesture.current = null;
    setDragging(false);
    if (horizontal && armed) {
      setDx(-width);
      setTimeout(onDelete, 160);
    } else {
      setDx(0);
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end bg-rose-500 pr-6 text-white"
        style={{ opacity: dx < 0 ? 0.35 + progress * 0.65 : 0 }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: `scale(${armed ? 1.15 : 0.9})`, transition: "transform 140ms" }}
        >
          <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </div>

      <button
        type="button"
        className="relative flex w-full touch-pan-y items-center gap-3 px-4 py-3 text-left select-none active:bg-white/70"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2,0.9,0.25,1)",
          // Opaque only while the delete layer is showing behind it.
          background: dx < 0 ? "#fbf9ff" : undefined,
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          swiped.current = false;
          gesture.current = { x: e.clientX, y: e.clientY, axis: null };
          setWidth(e.currentTarget.offsetWidth || 1);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g) return;
          const mx = e.clientX - g.x;
          const my = e.clientY - g.y;
          if (!g.axis) {
            if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
            g.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
            if (g.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (g.axis !== "x") return;
          swiped.current = true;
          setDragging(true);
          setDx(Math.min(0, mx));
        }}
        onPointerUp={release}
        onPointerCancel={() => {
          gesture.current = null;
          setDragging(false);
          setDx(0);
        }}
        onClick={() => {
          if (swiped.current) return;
          onTap();
        }}
      >
        {children}
      </button>
    </div>
  );
}
