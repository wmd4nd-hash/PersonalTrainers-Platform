import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { isDemoMode } from "@/lib/demo";

/**
 * Shown on every page while card payments are simulated, so nobody mistakes the
 * demo for the real thing. Rendered per request, so it follows the server's
 * settings even if they changed after the build.
 */
export function DemoBanner() {
  return (
    <Suspense fallback={null}>
      <DemoBannerContent />
    </Suspense>
  );
}

async function DemoBannerContent() {
  await connection();
  if (process.env.STRIPE_SECRET_KEY) return null;
  const style = "bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100";
  if (!isDemoMode()) {
    return (
      <div role="note" className={style}>
        Demo mode: payments are simulated and no money is taken.
      </div>
    );
  }
  return (
    <div role="note" className={style}>
      Public demo: payments are simulated, other visitors can see what you enter and the data resets regularly. Don&apos;t
      use real personal details.{" "}
      <Link href="/login" className="font-medium underline">
        Try a demo account
      </Link>
    </div>
  );
}
