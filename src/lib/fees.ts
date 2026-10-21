/**
 * Platform fee policy. A client's first paid booking or package with a trainer
 * pays the higher "new client" rate; after that the lower "repeat" rate applies,
 * so trainers have little reason to take regular clients off the platform.
 */
export type FeePolicy = { newClientPercent: number; repeatPercent: number };

function percentFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
}

export function feePolicy(): FeePolicy {
  return {
    newClientPercent: percentFromEnv("PLATFORM_FEE_NEW_CLIENT_PERCENT", 15),
    repeatPercent: percentFromEnv("PLATFORM_FEE_REPEAT_PERCENT", 5),
  };
}

export function platformFeeCents(
  amountCents: number,
  { isNewClient }: { isNewClient: boolean },
  policy: FeePolicy = feePolicy(),
): number {
  const percent = isNewClient ? policy.newClientPercent : policy.repeatPercent;
  return Math.round((amountCents * percent) / 100);
}

/** Per-session value of a package, used for earnings and refunds. */
export function perSessionCents(packagePriceCents: number, sessionCount: number): number {
  return sessionCount > 0 ? Math.round(packagePriceCents / sessionCount) : 0;
}
