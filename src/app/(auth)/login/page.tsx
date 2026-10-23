import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { isDemoMode } from "@/lib/demo";
import { DemoAccounts } from "./demo-accounts";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Welcome back</h1>
      <LoginForm />
      <Suspense fallback={null}>
        <DemoAccountsIfDemo />
      </Suspense>
    </Card>
  );
}

/** Read at request time, so it follows the server's DEMO_MODE even if it changed after the build. */
async function DemoAccountsIfDemo() {
  await connection();
  return isDemoMode() ? <DemoAccounts /> : null;
}
