import Link from "next/link";
import { Card } from "@/components/ui";
import { site } from "@/lib/site";

const steps = [
  {
    title: "Find your trainer",
    body: "Browse trainer profiles by specialty and city, with rates and experience up front.",
  },
  {
    title: "Book a session",
    body: "Pick an open time from the trainer's calendar and pay securely online.",
  },
  {
    title: "Follow your program",
    body: "Your trainer builds a workout program for you, with every set, rep and rest period.",
  },
];

export default function Home() {
  return (
    <div className="space-y-16 py-8">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Train with the right coach.
        </h1>
        <p className="mt-4 text-lg text-subtle">{site.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/trainers"
            className="rounded-lg bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark"
          >
            Find a trainer
          </Link>
          <Link
            href="/signup?role=TRAINER"
            className="rounded-lg border border-line bg-surface px-5 py-2.5 font-medium hover:bg-muted"
          >
            I&apos;m a trainer
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <Card key={step.title}>
            <p className="text-sm font-medium text-brand">Step {i + 1}</p>
            <h2 className="mt-1 font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-subtle">{step.body}</p>
          </Card>
        ))}
      </section>

      <section>
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">For trainers</h2>
            <p className="mt-1 text-sm text-subtle">
              Publish your profile, set weekly availability, take paid bookings and build programs
              for your clients.
            </p>
          </div>
          <Link
            href="/signup?role=TRAINER"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Create a trainer account
          </Link>
        </Card>
      </section>
    </div>
  );
}
