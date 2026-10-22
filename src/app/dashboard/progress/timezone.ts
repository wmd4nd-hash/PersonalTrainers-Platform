import "server-only";
import { cookies } from "next/headers";
import { isValidTimeZone } from "@/lib/progress";
import { TIMEZONE_COOKIE } from "./timezone-cookie";

/** The viewer's timezone as reported by their browser (see TimeZoneSync), or UTC. */
export async function getViewerTimeZone(): Promise<string> {
  const value = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  return isValidTimeZone(value) ? value : "UTC";
}
