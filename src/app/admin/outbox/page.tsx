import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Email outbox" };

export default function Page() {
  return <ComingSoon title="Email outbox" description="Every email the platform has sent." />;
}
