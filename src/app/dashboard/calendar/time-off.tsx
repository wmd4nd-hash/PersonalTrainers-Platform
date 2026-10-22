import { deleteTimeOff } from "@/app/actions/time-off";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card } from "@/components/ui";
import { db } from "@/lib/db";
import { dateKey, describeTimeOff } from "@/lib/scheduling";
import { TimeOffForm } from "./time-off-form";

/**
 * The trainer's upcoming time off with a form to add more. Render it only
 * after the trainer has been authenticated; `trainerId` must be theirs.
 */
export async function TimeOffManager({
  trainerId,
  timezone,
  now,
}: {
  trainerId: string;
  timezone: string;
  now: Date;
}) {
  const items = await db.timeOff.findMany({
    where: { trainerId, endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <Card id="time-off" className="scroll-mt-6 space-y-5">
      <div>
        <h2 className="font-semibold">Time off</h2>
        <p className="text-sm text-subtle">
          Block out holidays, appointments or sick days. Clients can&apos;t book these times. Dates and times are in
          your timezone ({timezone}).
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-subtle">No time off coming up.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Upcoming time off">
          {items.map((item) => {
            const label = describeTimeOff(item.startsAt, item.endsAt, timezone);
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {label}
                    {item.startsAt <= now && <Badge>Now</Badge>}
                  </p>
                  {item.reason && <p className="text-xs text-subtle">{item.reason}</p>}
                </div>
                <form action={deleteTimeOff.bind(null, item.id)}>
                  <SubmitButton
                    variant="ghost"
                    className="px-3 py-1 text-sm"
                    pendingText="Removing…"
                    aria-label={`Remove time off: ${label}${item.reason ? ` (${item.reason})` : ""}`}
                  >
                    Remove
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-line pt-4">
        <h3 className="mb-3 text-sm font-semibold">Add time off</h3>
        <TimeOffForm today={dateKey(now, timezone)} />
      </div>
    </Card>
  );
}
