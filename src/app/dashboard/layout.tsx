import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dashboardNav } from "@/lib/nav";

const headings = { TRAINER: "Trainer", CLIENT: "Client", ADMIN: "Admin" } as const;

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="grid gap-8 md:grid-cols-[190px_1fr]">
      {/* min-w-0: on phones the nav scrolls sideways instead of widening the page. */}
      <aside className="min-w-0">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <DashboardNav />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

async function DashboardNav() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin");
  return <SidebarNav heading={headings[user.role]} links={dashboardNav[user.role]} />;
}
