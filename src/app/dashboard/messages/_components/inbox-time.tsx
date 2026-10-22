"use client";

import { inboxTimeLabel } from "../_lib/format";
import { useBrowserTimeZone } from "./hooks";

/** When a conversation last had a message, in the viewer's own timezone. */
export function InboxTime({ iso, serverNow, fallbackTimeZone }: { iso: string; serverNow: string; fallbackTimeZone: string }) {
  const timeZone = useBrowserTimeZone(fallbackTimeZone);
  const date = new Date(iso);
  const full = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
  return (
    <time dateTime={iso} title={full} className="shrink-0 text-xs text-subtle">
      {inboxTimeLabel(date, new Date(serverNow), timeZone)}
    </time>
  );
}
