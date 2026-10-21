import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Verification queue" };

export default function Page() {
  return <ComingSoon title="Verification queue" description="Trainer documents waiting for review." />;
}
