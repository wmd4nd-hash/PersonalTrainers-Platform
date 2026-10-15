import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";

const trainerLinks = [
  { href: "/dashboard", label: "Bookings" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/availability", label: "Availability" },
  { href: "/dashboard/programs", label: "Programs" },
];

const clientLinks = [
  { href: "/dashboard", label: "Bookings" },
  { href: "/dashboard/programs", label: "My programs" },
  { href: "/trainers", label: "Find a trainer" },
];

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="grid gap-8 md:grid-cols-[180px_1fr]">
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
  const links = user.role === "TRAINER" ? trainerLinks : clientLinks;
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      <p className="mb-2 hidden px-3 text-xs font-medium uppercase tracking-wide text-subtle md:block">
        {user.role === "TRAINER" ? "Trainer" : "Client"}
      </p>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-muted"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
