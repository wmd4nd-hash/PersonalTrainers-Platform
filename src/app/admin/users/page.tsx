import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Users" };

export default function Page() {
  return <ComingSoon title="Users" description="Every account on the platform." />;
}
