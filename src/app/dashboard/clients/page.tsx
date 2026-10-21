import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  return <ComingSoon title="Clients" description="Everyone you have trained, with notes and progress." />;
}
