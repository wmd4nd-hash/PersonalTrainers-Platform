import type { Role } from "@/generated/prisma/client";
import { Badge } from "@/components/ui";

const roleLabels: Record<Role, string> = { CLIENT: "Client", TRAINER: "Trainer", ADMIN: "Admin" };

const roleStyles: Record<Role, string> = {
  CLIENT: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  TRAINER: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  ADMIN: "bg-muted text-foreground",
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge className={roleStyles[role]}>{roleLabels[role]}</Badge>;
}

export function SuspendedBadge() {
  return <Badge className="bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">Suspended</Badge>;
}
