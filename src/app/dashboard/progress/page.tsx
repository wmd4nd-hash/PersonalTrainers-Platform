import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Progress" };

export default function Page() {
  return <ComingSoon title="Progress" description="Your logged workouts." />;
}
