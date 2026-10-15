import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Create your account</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <SignupForm />
      </Suspense>
    </Card>
  );
}
