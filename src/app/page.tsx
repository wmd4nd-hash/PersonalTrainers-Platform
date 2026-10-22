import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GetForm } from "@/components/discovery/get-form";
import { TrainerCard, TrainerCardSkeleton } from "@/components/trainer-card";
import { Button, Card, Input } from "@/components/ui";
import { getFeaturedTrainers } from "@/lib/discovery";
import { DEFAULT_SEARCH, tagLabel, trainersHref } from "@/lib/search";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${site.name}: find a personal trainer near you or online` },
  description: site.description,
};

const popularGoals = ["strength", "weight loss", "running", "mobility", "yoga", "boxing", "pre-natal", "pilates"];

const steps = [
  {
    title: "Find your trainer",
    body: "Search by goal, city, price and language, or take the quiz and we'll suggest a few.",
  },
  {
    title: "Book a session",
    body: "Pick an open time from their calendar, in person or online, and pay securely by card.",
  },
  {
    title: "Train and track progress",
    body: "Your trainer builds a program for you, with every set, rep and rest period.",
  },
];

// Outline icons (Heroicons, MIT).
const icons = {
  shield:
    "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  lock: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
};

const trustPoints = [
  {
    icon: icons.shield,
    title: "Verified trainers",
    body: "We check certifications and insurance. Look for the Verified badge on a trainer's profile.",
  },
  {
    icon: icons.lock,
    title: "Secure payments",
    body: "Pay by card through Stripe. Trainers never see your card details.",
  },
  {
    icon: icons.calendar,
    title: "Clear cancellation policies",
    body: "Every trainer shows when you can cancel for free before you book, so there are no surprises.",
  },
];

export default function Home() {
  return (
    <div className="space-y-16 pb-8 sm:space-y-20">
      <section className="-mx-4 rounded-none bg-gradient-to-br from-brand/15 via-brand/5 to-transparent px-4 py-10 sm:mx-0 sm:rounded-3xl sm:px-10 sm:py-14">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Find a personal trainer who fits your life.
          </h1>
          <p className="mt-4 text-lg text-subtle">
            Verified coaches for strength, running, weight loss and more. Train in person near you or online, and book
            in minutes.
          </p>

          <GetForm action="/trainers" role="search" className="mt-8 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <label htmlFor="home-q" className="sr-only">
              Goal, specialty or trainer name
            </label>
            <Input id="home-q" name="q" type="search" placeholder="Goal or specialty, e.g. running" className="h-12 text-base" />
            <label htmlFor="home-city" className="sr-only">
              City
            </label>
            <Input id="home-city" name="city" placeholder="City (optional)" className="h-12 text-base" autoComplete="address-level2" />
            <Button type="submit" className="h-12 px-6 text-base">
              Search
            </Button>
          </GetForm>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-subtle">Popular:</span>
            {popularGoals.map((goal) => (
              <Link
                key={goal}
                href={trainersHref(DEFAULT_SEARCH, { q: goal })}
                className="rounded-full border border-line bg-surface px-3 py-1 text-sm hover:border-brand"
              >
                {tagLabel(goal)}
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/match"
          className="mt-8 flex max-w-2xl items-center justify-between gap-4 rounded-xl border border-brand/30 bg-surface p-4 hover:border-brand"
        >
          <span>
            <span className="block font-semibold">Not sure where to start?</span>
            <span className="text-sm text-subtle">Answer four questions and we&apos;ll suggest your best matches.</span>
          </span>
          <span className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
            Take the 1-minute quiz
          </span>
        </Link>
      </section>

      <section aria-labelledby="featured-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="featured-heading" className="text-2xl font-semibold tracking-tight">
              Top-rated trainers
            </h2>
            <p className="text-sm text-subtle">Verified trainers first, then the best reviewed.</p>
          </div>
          <Link href="/trainers" className="text-sm font-medium text-brand hover:underline">
            See all trainers →
          </Link>
        </div>
        <Suspense fallback={<FeaturedSkeleton />}>
          <FeaturedTrainers />
        </Suspense>
      </section>

      <section aria-labelledby="how-heading" className="space-y-4">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full">
                <p className="flex size-8 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                  {i + 1}
                </p>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-subtle">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust-heading" className="space-y-4">
        <h2 id="trust-heading" className="text-2xl font-semibold tracking-tight">
          Train with confidence
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {trustPoints.map((point) => (
            <li key={point.title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d={point.icon} />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-1 text-sm text-subtle">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="trainers-heading">
        <div className="grid gap-6 rounded-2xl bg-brand px-6 py-8 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:px-10">
          <div>
            <h2 id="trainers-heading" className="text-2xl font-semibold tracking-tight">
              Are you a personal trainer?
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-white/90">
              <li>✓ Get found by clients nearby and online</li>
              <li>✓ Take bookings and card payments, with your own cancellation policy</li>
              <li>✓ Build programs and message clients in one place</li>
            </ul>
          </div>
          <Link
            href="/signup?role=TRAINER"
            className="inline-flex justify-center rounded-lg bg-white px-5 py-2.5 font-medium text-brand-dark hover:bg-white/90"
          >
            Create a trainer profile
          </Link>
        </div>
      </section>
    </div>
  );
}

async function FeaturedTrainers() {
  // Fresh on every visit (so suspended or unpublished trainers drop off at once); the rest of the page is static.
  await connection();
  const trainers = await getFeaturedTrainers();
  if (trainers.length === 0) {
    return (
      <Card className="text-center text-sm text-subtle">
        Trainers are setting up their profiles. Check back soon, or{" "}
        <Link href="/signup?role=TRAINER" className="font-medium text-brand">
          join as a trainer
        </Link>
        .
      </Card>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trainers.map((trainer) => (
        <li key={trainer.id}>
          <TrainerCard trainer={trainer} headingLevel={3} />
        </li>
      ))}
    </ul>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <TrainerCardSkeleton key={i} />
      ))}
    </div>
  );
}
