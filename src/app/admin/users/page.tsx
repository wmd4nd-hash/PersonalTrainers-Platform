import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { VerificationStatusBadge } from "@/components/verified-badge";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { pageCount, parseUserFilters } from "@/lib/validation/trust";
import { formatDay } from "@/lib/verification";
import { Pagination } from "./pagination";
import { RoleBadge, SuspendedBadge } from "./role-badge";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 20;

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <PageHeader title="Users" description="Every account on the platform, newest first." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Users({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  await requireAdmin();
  const filters = parseUserFilters(await searchParams);
  const { q, role, page } = filters;
  const where: Prisma.UserWhereInput = {
    ...(role && { role }),
    ...(q && {
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }],
    }),
  };
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarFileId: true,
        createdAt: true,
        suspendedAt: true,
        trainerProfile: { select: { published: true, verificationStatus: true } },
      },
    }),
  ]);
  const filtered = Boolean(q || role);

  return (
    <>
      <form className="mb-6 grid gap-3 sm:grid-cols-[1fr_180px_auto]" role="search">
        <Field label="Name or email" name="q">
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. maya or @example.com" />
        </Field>
        <Field label="Role" name="role">
          <Select id="role" name="role" defaultValue={role ?? ""}>
            <option value="">Everyone</option>
            <option value="CLIENT">Clients</option>
            <option value="TRAINER">Trainers</option>
            <option value="ADMIN">Admins</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Search</Button>
          {filtered && (
            <Link href="/admin/users" className="rounded-lg px-3 py-2 text-sm hover:bg-muted">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mb-3 text-sm text-subtle">
        {total === 1 ? "1 account" : `${total} accounts`}
        {filtered && " match"}
      </p>
      {users.length === 0 ? (
        <Card className="text-center text-sm text-subtle">
          {filtered ? "No accounts match your search." : "No accounts yet."}
        </Card>
      ) : (
        <Card className="divide-y divide-line p-0">
          {users.map((user) => (
            <Link
              key={user.id}
              href={`/admin/users/${user.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted sm:px-5"
            >
              <Avatar name={user.name} fileId={user.avatarFileId} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-sm text-subtle">{user.email}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                {user.suspendedAt && (
                  <SuspendedBadge />
                )}
                {user.trainerProfile && <VerificationStatusBadge status={user.trainerProfile.verificationStatus} />}
                <RoleBadge role={user.role} />
                <span className="hidden w-24 text-right text-xs text-subtle md:inline">{formatDay(user.createdAt)}</span>
              </div>
            </Link>
          ))}
        </Card>
      )}
      <Pagination basePath="/admin/users" params={{ q, role }} page={page} pages={pageCount(total, PAGE_SIZE)} />
    </>
  );
}
