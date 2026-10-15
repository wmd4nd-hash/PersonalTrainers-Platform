import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { site } from "@/lib/site";
import { Button, Skeleton } from "./ui";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {site.shortName}
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/trainers" className="rounded-lg px-2 py-1 hover:bg-muted">
            Find a trainer
          </Link>
          <Suspense fallback={<Skeleton className="h-8 w-28" />}>
            <AccountNav />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function AccountNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <Link href="/login" className="rounded-lg px-2 py-1 hover:bg-muted">
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark"
        >
          Sign up
        </Link>
      </>
    );
  }
  return (
    <>
      <Link href="/dashboard" className="rounded-lg px-2 py-1 hover:bg-muted">
        Dashboard
      </Link>
      <form action={logout}>
        <Button variant="ghost" className="px-2 py-1">
          Log out
        </Button>
      </form>
    </>
  );
}
