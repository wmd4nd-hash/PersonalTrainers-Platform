"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "@/lib/nav";
import { cx } from "./ui";

export function SidebarNav({ heading, links }: { heading: string; links: NavLink[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" || href === "/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      <p className="mb-2 hidden px-3 text-xs font-medium uppercase tracking-wide text-subtle md:block">
        {heading}
      </p>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(link.href) ? "page" : undefined}
          className={cx(
            "whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-muted",
            isActive(link.href) && "bg-muted font-medium",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
