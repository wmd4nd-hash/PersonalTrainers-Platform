import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Welcome back</h1>
      <LoginForm />
    </Card>
  );
}
