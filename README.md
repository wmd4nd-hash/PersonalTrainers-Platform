# Personal Trainers Platform

A web platform that connects personal trainers with clients. Trainers publish a profile, set their weekly availability, take paid bookings and build workout programs. Clients find a trainer, book and pay for sessions, and follow the programs assigned to them.

## Features

| Area | Trainers | Clients |
| --- | --- | --- |
| Accounts | Email and password sign-up as a trainer | Email and password sign-up as a client |
| Profiles | Headline, bio, specialties, city, timezone, price, session length, publish toggle | Browse and search published trainers by name, specialty or city |
| Availability | Weekly recurring windows in their own timezone | See open slots for the next four weeks in the trainer's timezone |
| Bookings | See upcoming and past sessions, cancel, mark completed | Book a slot, pay with Stripe Checkout, cancel upcoming sessions |
| Programs | Create programs with day-by-day workouts and exercises (sets, reps, rest) and assign them to clients who have booked | View assigned programs |

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Server Actions, Cache Components) with React 19 and TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [PostgreSQL](https://www.postgresql.org) with [Prisma 7](https://www.prisma.io)
- Encrypted cookie sessions with [iron-session](https://github.com/vvo/iron-session) and bcrypt password hashing
- [Stripe Checkout](https://stripe.com/docs/payments/checkout) for payments
- [Zod](https://zod.dev) for form validation, [Vitest](https://vitest.dev) for tests

## Getting started

Requirements: Node.js 22+ and Docker (or any PostgreSQL 16 database).

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set SESSION_PASSWORD (openssl rand -base64 32)
docker compose up -d        # starts PostgreSQL on localhost:5432
npm run db:migrate          # creates the tables
npm run db:seed             # optional: demo trainers and a demo client
npm run dev
```

Open http://localhost:3000.

The seed creates three trainers (`maya@example.com`, `diego@example.com`, `aiko@example.com`) and one client (`client@example.com`), all with the password `password123`.

## Payments

Payments are optional during development. If `STRIPE_SECRET_KEY` is empty, bookings are confirmed straight away without payment.

To test real checkout:

1. Put your Stripe **test** secret key in `STRIPE_SECRET_KEY`.
2. Forward webhooks with the [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
3. Copy the `whsec_…` secret it prints into `STRIPE_WEBHOOK_SECRET`.

How a paid booking works:

1. The client picks a slot. The booking is created as **Awaiting payment** inside a serializable transaction, so two clients can't take the same slot.
2. The client is sent to Stripe Checkout. The session expires after 31 minutes, and the slot is held for 35 minutes.
3. `checkout.session.completed` confirms the booking. `checkout.session.expired` cancels it and frees the slot.

In production, add a webhook endpoint in the Stripe dashboard pointing at `https://<your-domain>/api/stripe/webhook` for those two events.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm test` | Unit tests (scheduling, money, validation) |
| `npm run db:migrate` | Create and apply a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Project layout

```
prisma/
  schema.prisma          Data model
  migrations/            SQL migrations
  seed.ts                Demo data
src/
  app/
    actions/             Server Actions (auth, trainer profile, bookings, programs)
    api/stripe/webhook/  Stripe webhook
    (auth)/              Login and sign-up pages
    trainers/            Public directory and trainer profile with booking
    dashboard/           Signed-in area (bookings, profile, availability, programs)
  components/            Shared UI
  lib/
    auth.ts              Current user and role checks
    session.ts           Encrypted session cookie
    scheduling.ts        Slot generation (timezone and DST aware)
    bookings.ts          Which bookings block a trainer's calendar
    validation.ts        Zod schemas for every form
    stripe.ts, money.ts, db.ts
  proxy.ts               Redirects signed-out visitors away from /dashboard
```

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_PASSWORD` | Yes | At least 32 characters, used to encrypt the session cookie |
| `APP_URL` | Yes in production | Public URL, used for Stripe redirect URLs |
| `STRIPE_SECRET_KEY` | No | Enables paid bookings |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Verifies webhook signatures |

## Known gaps and next steps

- **Refunds:** cancelling a paid booking doesn't refund it yet. Add a Stripe refund in `cancelBooking`, or pay trainers through Stripe Connect.
- **Trainer payouts:** all payments go to the platform's Stripe account. Use Stripe Connect to pay trainers directly and take a platform fee.
- **Email:** there are no booking confirmations, reminders or password resets yet.
- **Currency:** each trainer has one currency (defaults to USD). It can only be changed in the database for now.
- **Messaging, reviews and progress tracking** between trainers and clients.
