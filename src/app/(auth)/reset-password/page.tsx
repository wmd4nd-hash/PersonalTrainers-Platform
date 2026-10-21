import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return <ComingSoon title="Reset password" description="Choose a new password." />;
}
