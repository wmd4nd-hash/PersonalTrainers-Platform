import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { GetForm } from "@/components/discovery/get-form";
import { TimezoneInput } from "@/components/discovery/timezone-input";
import { Alert, Button, Card, Field, Input, Select, Skeleton } from "@/components/ui";
import { getFilterOptions } from "@/lib/discovery";
import {
  BUDGET_OPTIONS,
  MATCH_FORMATS,
  matchHref,
  matchParamsOf,
  TIMES_OF_DAY,
  type MatchAnswers,
} from "@/lib/matching";
import { GENDER_OPTIONS, tagLabel } from "@/lib/search";
import { parseMatchAnswers, parseQuizStep, QUIZ_STEPS } from "@/lib/validation/discovery";
import { Choice } from "./_components/choice";

export const metadata: Metadata = {
  title: "Find your trainer",
  description: "Answer four quick questions and we'll suggest personal trainers who fit your goal, budget and schedule.",
};

export default function MatchPage({ searchParams }: PageProps<"/match">) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Find your trainer</h1>
        <p className="mt-1 text-sm text-subtle">Four quick questions, then we&apos;ll suggest the trainers who fit you best.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Quiz searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The answers each step asks for; the others ride along as hidden fields. */
const STEP_FIELDS: Record<number, string[]> = {
  1: ["goal"],
  2: ["format", "city"],
  3: ["budget", "time"],
  4: ["gender", "language", "tz"],
};

async function Quiz({ searchParams }: Pick<PageProps<"/match">, "searchParams">) {
  const raw = await searchParams;
  const answers = parseMatchAnswers(raw);
  let step = parseQuizStep(raw);
  let error: string | undefined;
  if (step > 2 && answers.format === "in-person" && !answers.city) {
    step = 2;
    error = "Enter your city so we can find trainers near you.";
  }
  const { specialties, languages } = await getFilterOptions();
  const last = step === QUIZ_STEPS;
  const carried = [...matchParamsOf(answers)].filter(([name]) => !STEP_FIELDS[step].includes(name));

  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">
          Step {step} of {QUIZ_STEPS}
        </p>
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${(step / QUIZ_STEPS) * 100}%` }} />
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Keyed by step so each step's fields start from the saved answers. */}
      <GetForm key={step} action={last ? "/match/results" : "/match"} className="group space-y-5">
        {carried.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {!last && <input type="hidden" name="step" value={step + 1} />}

        {step === 1 && <GoalStep answers={answers} specialties={specialties} />}
        {step === 2 && <FormatStep answers={answers} />}
        {step === 3 && <BudgetStep answers={answers} />}
        {step === 4 && <PreferencesStep answers={answers} languages={languages} />}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          {step > 1 ? (
            <Link
              href={matchHref("/match", answers, { step: String(step - 1) })}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              ← Back
            </Link>
          ) : (
            <span />
          )}
          <Button type="submit">{last ? "See my matches" : "Next"}</Button>
        </div>
      </GetForm>
    </Card>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-subtle">{hint}</p>}
      </legend>
      {children}
    </fieldset>
  );
}

function GoalStep({ answers, specialties }: { answers: MatchAnswers; specialties: string[] }) {
  const goals = answers.goal && !specialties.includes(answers.goal) ? [answers.goal, ...specialties] : specialties;
  return (
    <Question title="What's your main goal?" hint="Pick the one that matters most right now.">
      <div className="grid grid-cols-2 gap-2">
        {goals.map((goal) => (
          <Choice key={goal} name="goal" value={goal} label={tagLabel(goal)} checked={answers.goal === goal} required />
        ))}
        <Choice name="goal" value="" label="Not sure yet" required />
      </div>
    </Question>
  );
}

function FormatStep({ answers }: { answers: MatchAnswers }) {
  return (
    <>
      <Question title="How would you like to train?">
        <div className="grid gap-2">
          {MATCH_FORMATS.map((f) => (
            <Choice
              key={f.value}
              id={`format-${f.value}`}
              name="format"
              value={f.value}
              label={f.label}
              hint={f.hint}
              checked={answers.format === f.value}
              required
            />
          ))}
        </div>
      </Question>
      {/* Only asked when they might meet in person. */}
      <div className="group-has-[#format-online:checked]:hidden">
        <Field label="Your city" name="quiz-city" hint="Needed for in-person sessions.">
          <Input id="quiz-city" name="city" defaultValue={answers.city} placeholder="e.g. London" maxLength={80} autoComplete="address-level2" />
        </Field>
      </div>
    </>
  );
}

function BudgetStep({ answers }: { answers: MatchAnswers }) {
  const budget = answers.budgetCents === undefined ? "" : String(answers.budgetCents / 100);
  return (
    <>
      <Question title="What's your budget per session?" hint="We compare this with each trainer's price in their own currency.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BUDGET_OPTIONS.map((b) => (
            <Choice key={b} name="budget" value={String(b)} label={`Up to ${b}`} checked={budget === String(b)} />
          ))}
          <Choice name="budget" value="" label="No limit" checked={budget === ""} />
        </div>
      </Question>
      <Question title="When do you like to train?">
        <div className="grid grid-cols-2 gap-2">
          {TIMES_OF_DAY.map((t) => (
            <Choice key={t.value} name="time" value={t.value} label={t.label} hint={t.hint} checked={answers.time === t.value} />
          ))}
          <Choice name="time" value="" label="Any time" hint="I'm flexible" checked={!answers.time} />
        </div>
      </Question>
    </>
  );
}

function PreferencesStep({ answers, languages }: { answers: MatchAnswers; languages: string[] }) {
  return (
    <>
      <Question title="Would you like a trainer of a particular gender?">
        <div className="grid grid-cols-2 gap-2">
          <Choice name="gender" value="" label="No preference" checked={!answers.gender} />
          {GENDER_OPTIONS.map((g) => (
            <Choice key={g.value} name="gender" value={g.value} label={g.label} checked={answers.gender === g.value} />
          ))}
        </div>
      </Question>
      <Field label="Language you'd like to train in" name="quiz-language">
        <Select id="quiz-language" name="language" defaultValue={answers.language ?? ""}>
          <option value="">Any language</option>
          {languages.map((language) => (
            <option key={language} value={language}>
              {tagLabel(language)}
            </option>
          ))}
        </Select>
      </Field>
      <TimezoneInput fallback={answers.timezone} />
    </>
  );
}
