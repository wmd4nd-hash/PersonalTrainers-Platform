import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Saved trainers" };

export default function Page() {
  return <ComingSoon title="Saved trainers" description="Trainers you have saved." />;
}
