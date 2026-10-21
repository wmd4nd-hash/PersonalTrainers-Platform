import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Payouts" };

export default function Page() {
  return <ComingSoon title="Payouts" description="Connect a bank account to get paid." />;
}
