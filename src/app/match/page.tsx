import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Find your trainer" };

export default function Page() {
  return <ComingSoon title="Find your trainer" description="Answer a few questions and we'll suggest trainers." />;
}
