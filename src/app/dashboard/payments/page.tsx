import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <ComingSoon title="Payments" description="Your payment history and receipts." />;
}
