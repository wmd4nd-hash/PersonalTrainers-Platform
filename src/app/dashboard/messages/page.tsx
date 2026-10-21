import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return <ComingSoon title="Messages" description="Conversations with your trainers or clients." />;
}
