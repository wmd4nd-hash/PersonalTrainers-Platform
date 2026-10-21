import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Earnings" };

export default function Page() {
  return <ComingSoon title="Earnings" description="What you have earned, after platform fees." />;
}
