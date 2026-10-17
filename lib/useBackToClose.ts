"use client";

import { useEffect, useRef } from "react";

/**
 * While `open`, the device/browser Back button closes the view instead of
 * leaving the app. Closing via the UI pops the extra history entry again.
 */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const marker = { overlay: Date.now() };
    history.pushState({ ...history.state, ...marker }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.overlay === marker.overlay) history.back();
    };
  }, [open]);
}
