import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Booking" };

export default function Page() {
  return <ComingSoon title="Booking" description="Session details, video link and cancellation." />;
}
