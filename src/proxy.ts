import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Optimistic check only: pages still verify the session before reading data.
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
