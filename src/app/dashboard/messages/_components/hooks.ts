"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

/** Fired on `window` after the viewer reads messages, so the header badge can catch up. */
export const MESSAGES_READ_EVENT = "ptp:messages-read";

const subscribeNever = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * The browser's timezone. Server rendering and hydration use `fallback`, so
 * the markup matches, then times switch to the viewer's own zone.
 */
export function useBrowserTimeZone(fallback: string) {
  return useSyncExternalStore(subscribeNever, browserTimeZone, () => fallback);
}

/**
 * Calls `poll` every `intervalMs` while the tab is visible, and straight away
 * when the tab becomes visible again. Never runs two polls at once.
 */
export function useVisiblePolling(poll: () => Promise<void>, intervalMs: number, enabled = true) {
  const onPoll = useEffectEvent(poll);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let stopped = false;

    function isVisible() {
      return document.visibilityState === "visible";
    }
    function schedule() {
      clearTimeout(timer);
      if (!stopped && isVisible()) timer = setTimeout(run, intervalMs);
    }
    async function run() {
      if (stopped || running || !isVisible()) return;
      running = true;
      try {
        await onPoll();
      } catch {
        // A network blip; the next poll tries again.
      } finally {
        running = false;
      }
      schedule();
    }
    function onVisibilityChange() {
      if (isVisible()) void run();
      else clearTimeout(timer);
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
