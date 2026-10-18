"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Sheets open right now; one can open over another (the PIN sheet). */
let openSheets = 0;

/** Bottom sheet on mobile, centered card on wider screens. */
export default function Sheet({ open, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // Pause the galaxy behind the sheet (globals.css), so the phone isn't
    // redrawing it and the frosted cards while the sheet opens and the keyboard is up.
    openSheets += 1;
    document.documentElement.classList.add("sheet-open");

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      openSheets -= 1;
      if (!openSheets) document.documentElement.classList.remove("sheet-open");
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        // A plain tint: a backdrop blur here re-blurs the moving galaxy every frame.
        className="animate-fade absolute inset-0 bg-[#2e1065]/25"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet relative w-full max-w-md rounded-t-[28px] bg-white px-5 pt-3 pb-safe shadow-[0_-12px_40px_-12px_rgb(76_29_149/0.35)] sm:rounded-[28px] sm:pb-5"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-violet-200 sm:hidden" />
        <h2 className="mb-4 text-center text-sm font-semibold text-muted">{title}</h2>
        {children}
      </div>
    </div>
  );
}
