import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { perSessionCents } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { savingsPercent } from "@/lib/package-pricing";
import { BuyPackageButton } from "./buy-package-button";

/** Session packages on the trainer's public page. Renders nothing if none are on sale. */
export async function PackagesSection({
  trainer,
  viewer,
}: {
  trainer: { id: string; userId?: string; currency: string; sessionRateCents: number };
  viewer: CurrentUser | null;
}) {
  const packages = await db.package.findMany({
    where: { trainerId: trainer.id, active: true },
    orderBy: [{ sessionCount: "asc" }, { createdAt: "asc" }],
  });
  if (packages.length === 0) return null;

  const isOwner = viewer !== null && viewer.id === trainer.userId;

  return (
    <section aria-labelledby="packages-heading" className="space-y-3">
      <div>
        <h2 id="packages-heading" className="font-semibold">
          Packages
        </h2>
        <p className="text-sm text-subtle">Pay for several sessions up front and pay less for each one.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {packages.map((p) => {
          const price = formatMoney(p.priceCents, trainer.currency);
          const saving = savingsPercent(p.priceCents, p.sessionCount, trainer.sessionRateCents);
          return (
            <li key={p.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold break-words">{p.title}</h3>
                  {saving > 0 && (
                    <Badge className="shrink-0 bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200">
                      Save {saving}%
                    </Badge>
                  )}
                </div>
                {p.description && <p className="text-sm whitespace-pre-line break-words text-subtle">{p.description}</p>}
                <div>
                  <p>
                    <span className="text-2xl font-semibold">{price}</span>{" "}
                    <span className="text-sm text-subtle">for {p.sessionCount} sessions</span>
                  </p>
                  <p className="text-sm text-subtle">
                    {formatMoney(perSessionCents(p.priceCents, p.sessionCount), trainer.currency)} per session ·
                    use within {p.validDays} days
                  </p>
                </div>
                <div className="mt-auto">
                  {viewer?.role === "CLIENT" ? (
                    <BuyPackageButton packageId={p.id} title={p.title} priceLabel={price} />
                  ) : !viewer ? (
                    <p className="text-sm">
                      <Link href="/login" className="font-medium text-brand">
                        Log in
                      </Link>{" "}
                      or{" "}
                      <Link href="/signup" className="font-medium text-brand">
                        sign up
                      </Link>{" "}
                      to buy.
                    </p>
                  ) : isOwner ? (
                    <p className="text-xs text-subtle">This is how clients see your package.</p>
                  ) : (
                    <p className="text-xs text-subtle">Only client accounts can buy packages.</p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
