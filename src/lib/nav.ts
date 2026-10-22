import type { Role } from "@/generated/prisma/client";

export type NavLink = { href: string; label: string };

/** Dashboard sidebar per role. Each feature owns the pages its links point to. */
export const dashboardNav: Record<Role, NavLink[]> = {
  TRAINER: [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/calendar", label: "Calendar" },
    { href: "/dashboard/messages", label: "Messages" },
    { href: "/dashboard/clients", label: "Clients" },
    { href: "/dashboard/programs", label: "Programs" },
    { href: "/dashboard/packages", label: "Packages" },
    { href: "/dashboard/reviews", label: "Reviews" },
    { href: "/dashboard/earnings", label: "Earnings" },
    { href: "/dashboard/payouts", label: "Payouts" },
    { href: "/dashboard/profile", label: "Profile" },
    { href: "/dashboard/availability", label: "Availability" },
    { href: "/dashboard/verification", label: "Verification" },
    { href: "/dashboard/settings", label: "Settings" },
  ],
  CLIENT: [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/messages", label: "Messages" },
    { href: "/dashboard/programs", label: "My programs" },
    { href: "/dashboard/progress", label: "Progress" },
    { href: "/dashboard/packages", label: "My packages" },
    { href: "/dashboard/favorites", label: "Saved trainers" },
    { href: "/dashboard/payments", label: "Payments" },
    { href: "/dashboard/settings", label: "Settings" },
    { href: "/trainers", label: "Find a trainer" },
  ],
  ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/verification", label: "Verification queue" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/outbox", label: "Email outbox" },
    { href: "/dashboard/settings", label: "Settings" },
  ],
};
