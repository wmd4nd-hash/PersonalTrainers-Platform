import { Suspense } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dashboardNav } from "@/lib/nav";

const headings = { TRAINER: "Trainer", CLIENT: "Client", ADMIN: "Admin" } as const;

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="grid gap-8 md:grid-cols-[190px_1fr]">
      <aside>
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
  // Admins can use the account pages here (settings, notifications); the other
  // dashboard pages check the role themselves and send admins to /admin.
  return <SidebarNav heading={headings[user.role]} links={dashboardNav[user.role]} />;
}
