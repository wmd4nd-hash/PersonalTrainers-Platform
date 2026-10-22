/** Shown on every page while card payments are simulated, so nobody mistakes the demo for the real thing. */
export function DemoBanner() {
  if (process.env.STRIPE_SECRET_KEY) return null;
  return (
    <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      Demo mode: payments are simulated and no money is taken.
    </div>
  );
}
