"use client";

import { useActionState, useState } from "react";
import { createPackage, updatePackage } from "@/app/actions/packages";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { perSessionCents } from "@/lib/fees";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { fullPriceCents, PACKAGE_LIMITS, savingsPercent } from "@/lib/package-pricing";
import type { FormState } from "@/lib/validation";

export type PackageValues = {
  title: string;
  description: string;
  sessionCount: string;
  price: string;
  validDays: string;
};

const EMPTY: PackageValues = { title: "", description: "", sessionCount: "5", price: "", validDays: "90" };

/** Create a package, or edit one when `packageId` and `initial` are given. */
export function PackageForm({
  packageId,
  initial,
  singleRateCents,
  currency,
}: {
  packageId?: string;
  initial?: PackageValues;
  singleRateCents: number;
  currency: string;
}) {
  const [values, setValues] = useState(initial ?? EMPTY);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = packageId ? await updatePackage(packageId, prev, formData) : await createPackage(prev, formData);
    // Fields are controlled, so they survive a failed submit; clear them after creating.
    if (result.ok && !packageId) setValues(EMPTY);
    return result;
  }, {});
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${packageId ?? "new"}-${name}`;
  const bind = (name: keyof PackageValues) => ({
    id: id(name),
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{packageId ? "Changes saved." : "Package created and on sale."}</Alert>}
      <Field label="Name" name={id("title")} errors={errors.title}>
        <Input {...bind("title")} placeholder="e.g. 10-session pack" maxLength={80} required />
      </Field>
      <Field label="Description (optional)" name={id("description")} errors={errors.description}>
        <Textarea {...bind("description")} rows={2} maxLength={500} placeholder="What's included, who it suits" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Sessions"
          name={id("sessionCount")}
          errors={errors.sessionCount}
          hint={`${PACKAGE_LIMITS.minSessions} to ${PACKAGE_LIMITS.maxSessions}`}
        >
          <Input
            {...bind("sessionCount")}
            type="number"
            inputMode="numeric"
            min={PACKAGE_LIMITS.minSessions}
            max={PACKAGE_LIMITS.maxSessions}
            required
          />
        </Field>
        <Field
          label={`Total price (${currency.toUpperCase()})`}
          name={id("price")}
          errors={errors.price}
          hint="What the client pays for all sessions"
        >
          <Input {...bind("price")} inputMode="decimal" placeholder="e.g. 250" autoComplete="off" required />
        </Field>
        <Field
          label="Valid for (days)"
          name={id("validDays")}
          errors={errors.validDays}
          hint={`${PACKAGE_LIMITS.minValidDays} to ${PACKAGE_LIMITS.maxValidDays}, from the day it's bought`}
        >
          <Input
            {...bind("validDays")}
            type="number"
            inputMode="numeric"
            min={PACKAGE_LIMITS.minValidDays}
            max={PACKAGE_LIMITS.maxValidDays}
            required
          />
        </Field>
      </div>
      <PricePreview values={values} singleRateCents={singleRateCents} currency={currency} />
      <SubmitButton pendingText="Saving…">{packageId ? "Save changes" : "Create package"}</SubmitButton>
    </form>
  );
}

function PricePreview({
  values,
  singleRateCents,
  currency,
}: {
  values: PackageValues;
  singleRateCents: number;
  currency: string;
}) {
  const sessions = Number(values.sessionCount);
  const priceCents = parseMoneyToCents(values.price);
  const single = formatMoney(singleRateCents, currency);
  if (!Number.isInteger(sessions) || sessions < 1 || priceCents === null) {
    return <p className="text-sm text-subtle">Your single-session rate is {single}.</p>;
  }
  const saving = savingsPercent(priceCents, sessions, singleRateCents);
  const savedCents = fullPriceCents(sessions, singleRateCents) - priceCents;
  const compared = `${sessions} single sessions at ${single}`;
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
      {formatMoney(perSessionCents(priceCents, sessions), currency)} per session.{" "}
      {savedCents > 0
        ? `Clients save ${saving > 0 ? `${saving}% (${formatMoney(savedCents, currency)})` : formatMoney(savedCents, currency)} compared with ${compared}.`
        : savedCents === 0
          ? `That's the same as ${compared}.`
          : `That's ${formatMoney(-savedCents, currency)} more than ${compared}.`}
    </p>
  );
}
