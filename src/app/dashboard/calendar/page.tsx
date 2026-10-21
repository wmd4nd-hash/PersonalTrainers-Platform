import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return <ComingSoon title="Calendar" description="Your week of sessions and time off." />;
}
