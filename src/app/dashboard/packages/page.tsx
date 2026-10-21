import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ClientPackages } from "./client-packages";
import { TrainerPackages } from "./trainer-packages";

export const metadata: Metadata = { title: "Packages" };

export default function PackagesPage({ searchParams }: PageProps<"/dashboard/packages">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Packages searchParams={searchParams} />
    </Suspense>
  );
}

async function Packages({ searchParams }: Pick<PageProps<"/dashboard/packages">, "searchParams">) {
  const user = await requireUser();
  if (user.role === "TRAINER") return <TrainerPackages />;
  if (user.role !== "CLIENT") redirect("/admin");

  const { purchased } = await searchParams;
  return <ClientPackages clientId={user.id} purchasedId={typeof purchased === "string" ? purchased : undefined} />;
}
