"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Sends the visitor's timezone with the form, so "mornings" means their
 * mornings. Falls back to an earlier answer (e.g. from a shared link).
 */
export function TimezoneInput({ fallback }: { fallback?: string }) {
  const detected = useSyncExternalStore(subscribe, browserTimezone, () => "");
  const timezone = detected || fallback;
  return timezone ? <input type="hidden" name="tz" value={timezone} /> : null;
}
