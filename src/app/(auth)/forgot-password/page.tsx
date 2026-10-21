import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return <ComingSoon title="Forgot password" description="We'll email you a link to reset it." />;
}
