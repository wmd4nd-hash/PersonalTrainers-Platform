import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { pageCount, parseBookingFilters, type BookingFilters } from "@/lib/validation/trust";
import { Pagination } from "../users/pagination";
import { AdminBookingList, adminBookingSelect, bookingStatusLabels } from "./booking-list";

export const metadata: Metadata = { title: "Bookings" };

const PAGE_SIZE = 20;
const DAY_MS = 86_400_000;

export default function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <>
      <PageHeader title="Bookings" description="Every booking on the platform, latest sessions first." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function whereFor({ q, status, from, to }: BookingFilters): Prisma.BookingWhereInput {
  const text = { contains: q, mode: "insensitive" as const };
  return {
    ...(status && { status }),
    ...((from || to) && {
      startsAt: { ...(from && { gte: from }), ...(to && { lt: new Date(to.getTime() + DAY_MS) }) },
    }),
    ...(q && {
      OR: [
        { client: { OR: [{ name: text }, { email: text }] } },
        { trainer: { user: { OR: [{ name: text }, { email: text }] } } },
      ],
    }),
  };
}

const dayValue = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

async function Bookings({ searchParams }: Pick<PageProps<"/admin/bookings">, "searchParams">) {
  await requireAdmin();
  const filters = parseBookingFilters(await searchParams);
  const where = whereFor(filters);
  const [total, bookings] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({
      where,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: adminBookingSelect,
    }),
  ]);
  const filtered = Boolean(filters.q || filters.status || filters.from || filters.to);

  return (
    <>
      <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_160px_auto]" role="search">
        <Field label="Client or trainer" name="q">
          <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Name or email" />
        </Field>
        <Field label="Status" name="status">
          <Select id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any status</option>
            {Object.entries(bookingStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Session from" name="from">
          <Input id="from" name="from" type="date" defaultValue={dayValue(filters.from)} />
        </Field>
        <Field label="Session to" name="to">
          <Input id="to" name="to" type="date" defaultValue={dayValue(filters.to)} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Filter</Button>
          {filtered && (
            <Link href="/admin/bookings" className="rounded-lg px-3 py-2 text-sm hover:bg-muted">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mb-3 text-sm text-subtle">
        {total === 1 ? "1 booking" : `${total} bookings`}
        {filtered && " match"} · dates are in UTC, times in the trainer&apos;s timezone
      </p>
      <AdminBookingList
        bookings={bookings}
        now={new Date()}
        empty={filtered ? "No bookings match these filters." : "No bookings yet."}
      />
      <Pagination
        basePath="/admin/bookings"
        params={{
          q: filters.q,
          status: filters.status,
          from: dayValue(filters.from),
          to: dayValue(filters.to),
        }}
        page={filters.page}
        pages={pageCount(total, PAGE_SIZE)}
      />
    </>
  );
}
