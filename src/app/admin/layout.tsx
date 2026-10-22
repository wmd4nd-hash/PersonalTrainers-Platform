import { Suspense } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { dashboardNav } from "@/lib/nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="grid gap-8 md:grid-cols-[190px_1fr]">
      {/* min-w-0: on phones the nav scrolls sideways instead of widening the page. */}
      <aside className="min-w-0">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <AdminNav />
        </Suspense>
      </aside>
      <div className="min-w-0">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <AdminGate>{children}</AdminGate>
        </Suspense>
      </div>
    </div>
  );
}

async function AdminNav() {
  await requireAdmin();
  return <SidebarNav heading="Admin" links={dashboardNav.ADMIN} />;
}

/** Blocks the page body for non-admins; pages must still check requireAdmin() themselves. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
