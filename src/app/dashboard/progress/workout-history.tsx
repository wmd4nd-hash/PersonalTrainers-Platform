import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui";
import { deleteWorkoutLog } from "@/app/actions/progress";
import { formatDay, formatKg, workoutVolume, type PersonalBest } from "@/lib/progress";
import { ConfirmAction } from "../programs/confirm-action";

export type HistoryLog = {
  id: string;
  completedAt: Date;
  effort: number | null;
  notes: string;
  workout: { dayNumber: number; title: string; program: { title: string } };
  entries: { id: string; setsDone: number; reps: string; weightKg: number | null; exercise: { name: string } }[];
};

const time = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);

/** Logged workouts, newest first, each expandable to the numbers recorded. */
export function WorkoutHistory({
  logs,
  timeZone,
  canDelete = false,
}: {
  logs: HistoryLog[];
  timeZone: string;
  /** Show a delete button (the client's own history only). */
  canDelete?: boolean;
}) {
  return (
    <ul className="space-y-2" aria-label="Workout history">
      {logs.map((log) => {
        const volume = workoutVolume(log.entries);
        return (
          <li key={log.id}>
            <details className="group rounded-xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block font-medium">
                    Day {log.workout.dayNumber}: {log.workout.title}
                  </span>
                  <span className="block text-xs text-subtle">
                    {formatDay(log.completedAt, timeZone)} at {time(log.completedAt, timeZone)} ·{" "}
                    {log.workout.program.title}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-subtle">
                  {volume > 0 && <span>{formatKg(volume, 0)} volume</span>}
                  {log.effort !== null && <Badge>Effort {log.effort}/10</Badge>}
                  <span aria-hidden className="transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </span>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                {log.entries.length === 0 ? (
                  <p className="text-sm text-subtle">No exercises recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-subtle">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Exercise</th>
                          <th className="py-1 pr-3 font-medium">Sets</th>
                          <th className="py-1 pr-3 font-medium">Reps</th>
                          <th className="py-1 font-medium">Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {log.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="py-2 pr-3">{entry.exercise.name}</td>
                            <td className="py-2 pr-3">{entry.setsDone}</td>
                            <td className="py-2 pr-3">{entry.reps || "–"}</td>
                            <td className="py-2">{entry.weightKg ? formatKg(entry.weightKg, 2) : "Bodyweight"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {log.notes && <p className="whitespace-pre-line text-sm">“{log.notes}”</p>}
                {canDelete && (
                  <ConfirmAction
                    action={deleteWorkoutLog.bind(null, log.id)}
                    label="Delete log"
                    buttonClassName="px-3 py-1 text-xs"
                    confirmLabel="Yes, delete"
                    pendingText="Deleting…"
                    message="Delete this logged workout? Your progress and personal bests will be recalculated."
                  />
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** Personal bests per exercise with a sparkline of the heaviest weight each session. */
export function PersonalBests({ bests, timeZone }: { bests: PersonalBest[]; timeZone: string }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Personal bests">
      {bests.map((best) => {
        const weights = best.history.map((h) => h.weightKg);
        return (
          <li key={best.name} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">{best.name}</p>
              <p className="text-sm">
                Best <strong>{formatKg(best.maxWeightKg, 2)}</strong>{" "}
                <span className="text-subtle">on {formatDay(best.maxWeightOn, timeZone)}</span>
              </p>
              {best.bestOneRepMaxKg !== null && (
                <p className="text-xs text-subtle">Estimated 1-rep max {formatKg(best.bestOneRepMaxKg)}</p>
              )}
            </div>
            {weights.length > 1 && (
              <Sparkline
                values={weights}
                className="text-brand"
                label={`${best.name}: ${formatKg(weights[0], 2)} to ${formatKg(weights.at(-1)!, 2)} over ${weights.length} sessions`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
