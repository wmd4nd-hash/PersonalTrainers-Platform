import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Admin" };

export default function Page() {
  return <ComingSoon title="Admin" description="Platform overview." />;
}
