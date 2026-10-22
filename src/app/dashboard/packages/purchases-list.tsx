import { Card } from "@/components/ui";
import type { PurchaseState } from "@/lib/package-pricing";
import { PurchaseBadge } from "./purchase-status";
import { RefundButton } from "./refund-button";

/** One sale of the trainer's packages, ready to display. */
export type PurchaseRow = {
  id: string;
  clientName: string;
  clientEmail: string;
  title: string;
  price: string;
  sessionsUsed: number;
  sessionsTotal: number;
  /** Sessions booked with it that haven't happened yet. */
  upcoming: number;
  expires: string;
  state: PurchaseState;
  /** Amount refunded so far, formatted, or null. */
  refunded: string | null;
  /** Set when unused sessions can be refunded, e.g. "$160.00 for 2 unused sessions". */
  refundSummary: string | null;
};

function RefundAction({ row }: { row: PurchaseRow }) {
  if (!row.refundSummary) return null;
  if (row.upcoming > 0) {
    return (
      <p className="text-xs text-subtle">
        Cancel the booked {row.upcoming === 1 ? "session" : "sessions"} to refund the rest.
      </p>
    );
  }
  return <RefundButton purchaseId={row.id} clientName={row.clientName} summary={row.refundSummary} />;
}

/** Cards on narrow screens, a table on wide ones. */
export function PurchasesList({ rows }: { rows: PurchaseRow[] }) {
  return (
    <>
      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="space-y-2 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.clientName}</p>
                  <p className="text-xs break-words text-subtle">{row.clientEmail}</p>
                </div>
                <PurchaseBadge state={row.state} />
              </div>
              <p>
                {row.title} · {row.price}
              </p>
              <p className="text-subtle">
                {row.sessionsUsed} of {row.sessionsTotal} sessions used
                {row.upcoming > 0 && ` (${row.upcoming} booked ahead)`} · expires {row.expires}
              </p>
              {row.refunded && <p className="text-subtle">Refunded {row.refunded}</p>}
              <RefundAction row={row} />
            </Card>
          </li>
        ))}
      </ul>

      <div className="relative hidden overflow-x-auto rounded-xl border border-line bg-surface lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-subtle">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Client</th>
              <th scope="col" className="px-4 py-2 font-medium">Package</th>
              <th scope="col" className="px-4 py-2 font-medium">Sessions used</th>
              <th scope="col" className="px-4 py-2 font-medium">Expires</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.clientName}</p>
                  <p className="text-xs [overflow-wrap:anywhere] text-subtle">{row.clientEmail}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{row.title}</p>
                  <p className="text-xs text-subtle">{row.price}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.sessionsUsed} / {row.sessionsTotal}
                  {row.upcoming > 0 && <p className="text-xs text-subtle">{row.upcoming} booked ahead</p>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{row.expires}</td>
                <td className="px-4 py-3">
                  <PurchaseBadge state={row.state} />
                  {row.refunded && <p className="mt-1 text-xs text-subtle">Refunded {row.refunded}</p>}
                </td>
                <td className="w-72 px-4 py-3">
                  <RefundAction row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
