import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Reviews" };

export default function Page() {
  return <ComingSoon title="Reviews" description="Moderate client reviews." />;
}
