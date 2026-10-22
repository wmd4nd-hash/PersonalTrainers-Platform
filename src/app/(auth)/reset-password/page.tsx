import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { hashToken, resetTokenProblem } from "@/lib/account";
import { db } from "@/lib/db";
import { firstParam } from "@/lib/validation/notifications";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  // The token is in the URL: don't leak it to other sites or search engines.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Card className="mx-auto max-w-md">
      <Suspense fallback={<Skeleton className="h-64" />}>
        <ResetPassword searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function ResetPassword({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const token = firstParam((await searchParams).token)?.trim() ?? "";
  const record =
    token && token.length <= 200
      ? await db.passwordResetToken.findUnique({
          where: { tokenHash: hashToken(token) },
          select: { expiresAt: true, usedAt: true, user: { select: { suspendedAt: true } } },
        })
      : null;

  if (!record || resetTokenProblem(record, new Date()) || record.user.suspendedAt) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">This link has expired</h1>
        <p className="text-sm text-subtle">
          Reset links work for 1 hour and only once. Using one also cancels any other reset links we sent you.
          Request a new link and use the newest email.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-subtle">Use at least 8 characters. You&apos;ll log in with it next time.</p>
      <ResetPasswordForm token={token} />
    </>
  );
}
