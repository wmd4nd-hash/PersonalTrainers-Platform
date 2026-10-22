"use client";

import { useSyncExternalStore } from "react";
import { formatSlot, formatSlotRange, sameWallTime } from "@/lib/scheduling";

const subscribe = () => () => {};

/** The browser's timezone, or null while rendering on the server. */
export function useViewerTimezone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

/**
 * "Your time: Tue, Oct 22, 4:00 – 5:00 AM EDT". Renders nothing when the
 * viewer's clock shows the same time as the trainer's.
 */
export function LocalTime({
  start,
  end,
  timezone,
  prefix = "Your time:",
  className,
}: {
  start: Date;
  end?: Date;
  /** The timezone the time is already shown in. */
  timezone: string;
  prefix?: string;
  className?: string;
}) {
  const viewerTimezone = useViewerTimezone();
  if (!viewerTimezone || sameWallTime(start, timezone, viewerTimezone)) return null;
  const text = end ? formatSlotRange(start, end, viewerTimezone) : formatSlot(start, viewerTimezone);
  return (
    <span className={className}>
      {prefix} {text}
    </span>
  );
}
