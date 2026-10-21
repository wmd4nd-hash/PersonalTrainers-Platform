import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <ComingSoon title="Notifications" description="Everything that happened on your account." />;
}
