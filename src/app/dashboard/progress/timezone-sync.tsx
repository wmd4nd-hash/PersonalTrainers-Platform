"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TIMEZONE_COOKIE } from "./timezone-cookie";

function currentCookie() {
  const prefix = `${TIMEZONE_COOKIE}=`;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
}

/**
 * Tells the server the browser's timezone so weeks and dates follow the
 * client's own clock. Refreshes once when it changes; renders nothing.
 */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // IANA names only use cookie-safe characters, so no encoding is needed.
    if (!timeZone || currentCookie() === timeZone) return;
    document.cookie = `${TIMEZONE_COOKIE}=${timeZone}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
