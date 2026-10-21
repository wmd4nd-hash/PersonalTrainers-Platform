import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-sm text-subtle">
        Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </Card>
  );
}
