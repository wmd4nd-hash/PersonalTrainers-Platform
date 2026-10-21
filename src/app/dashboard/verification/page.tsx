import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Verification" };

export default function Page() {
  return <ComingSoon title="Verification" description="Upload certificates and insurance to get a verified badge." />;
}
