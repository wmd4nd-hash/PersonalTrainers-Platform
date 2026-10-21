import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Packages" };

export default function Page() {
  return <ComingSoon title="Packages" description="Session packages." />;
}
