# Personal Trainers Platform

A marketplace where clients find a personal trainer, book and pay for sessions (in person or online), buy session packages and follow the training programs their trainer builds for them. Trainers run their business from one dashboard: profile, availability, calendar, clients, programs, packages, earnings and payouts. Admins verify trainers and keep the platform tidy.

This is a working proof of concept. Payments are simulated unless Stripe keys are set (see [Payments](#payments)).

## Features

**Clients**

- Search and filter trainers by name, specialty, city, in person or online, price, gender, language, rating and verified status, or take the short matching quiz (`/match`) for a ranked shortlist with reasons
- Trainer profiles with photo, verified badge, ratings and reviews, packages, languages and cancellation policy
- Book a slot from the trainer's live calendar (timezone aware), pay by card or with a package session, get a video link for online sessions, add the session to a calendar, reschedule or cancel with the refund shown up front
- Buy session packages, see sessions left and expiry
- Message trainers; messages that share phone numbers or payment links show a protection notice
- Leave a review after a completed session
- See assigned workout programs, log workouts (sets, reps, weight, effort) and track progress and personal bests
- Saved trainers, payment history with printable receipts, notifications (in app and email), a private calendar feed, settings

**Trainers**

- Profile with photo, specialties, languages, formats (in person, online or both), price, session length, minimum notice and cancellation policy
- Weekly availability, time off, and a week calendar of sessions
- Bookings: mark completed, cancel (always a full refund for the client), reschedule (the client can then cancel that session free of charge)
- Session packages: create, edit, take off sale, refund unused sessions
- Clients list with booking history, workout logs and private notes
- Programs: workouts and exercises, duplicate, reorder, assign with a start date
- Reviews with public replies
- Earnings by month with CSV export, and payouts through Stripe Connect Express
- Verification: upload certification and insurance documents for the Verified badge

**Admins** (`/admin`)

- Overview of users, bookings, booking value, fees and refunds
- Verification queue: approve or reject documents
- Users: search, view, suspend and unsuspend, remove photos
- Bookings: filter and cancel with a full refund
- Review moderation, and the email outbox (view and resend)

**Platform fee:** 15% on a client's first paid booking or package with a trainer, then 5% on repeat business, so trainers have little reason to take clients off the platform. Both rates are configurable.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Server Actions, Cache Components) with React 19 and TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [PostgreSQL](https://www.postgresql.org) with [Prisma 7](https://www.prisma.io)
- Encrypted cookie sessions with [iron-session](https://github.com/vvo/iron-session) and bcrypt password hashing
- [Stripe Checkout and Connect](https://stripe.com/docs/connect) for payments and trainer payouts
- [Nodemailer](https://nodemailer.com) for email, [Zod](https://zod.dev) for validation
- [Vitest](https://vitest.dev) unit tests and [Playwright](https://playwright.dev) browser tests

## Getting started

Requirements: Node.js 22+ and Docker (or any PostgreSQL 16 database).

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set SESSION_PASSWORD (openssl rand -base64 32)
docker compose up -d        # starts PostgreSQL on localhost:5432
npm run db:migrate          # creates the tables
npm run db:seed             # optional: demo data
npm run dev
```

Open http://localhost:3000.

### Demo accounts

`npm run db:seed` loads demo data. Every demo account uses the password `password123`:

| Role | Accounts |
| --- | --- |
| Trainers | `maya@example.com` (London), `diego@example.com` (New York), `aiko@example.com` (online only), `lukas@example.com` (Berlin), `sofia@example.com` (Lisbon), `omar@example.com` (Dubai) |
| Clients | `client@example.com`, `priya@example.com`, `tom@example.com` |
| Admin | `admin@example.com` |

`client@example.com` has a package, a program, workout history, messages and a completed session with Maya waiting for a review.

The seed refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`, because the demo admin's password is public. For a real admin account:

```bash
ADMIN_PASSWORD='a long, unique password' npm run admin:create -- you@yourdomain.com "Your Name"
```

## Public demo on Render

`render.yaml` describes a free public demo on [Render](https://render.com): a web service and a PostgreSQL database. To create it:

1. Sign in to Render with GitHub and give it access to this repository.
2. Choose **New → Blueprint**, pick this repository and the `claude/poc-platform` branch, and confirm. Render creates both services and generates the secrets.
3. When the deploy finishes, open the `onrender.com` link Render shows.

What the demo does:

- `DEMO_MODE=true`: payments are simulated, and a banner tells visitors not to enter real details. The login page lists the demo accounts.
- Every restart wipes the database and loads fresh demo data (`DEMO_RESET_ON_START=true`). On the free plan the service sleeps after about 15 minutes without visitors, so the demo resets itself after quiet periods. The first visit after a sleep takes about a minute.
- Visitors can't change the demo accounts' passwords, suspend them or lock them with wrong passwords.
- Emails aren't sent: they appear in the admin's **Email outbox**.

Render's free PostgreSQL databases are deleted after 30 days unless upgraded; recreate the Blueprint to start again. To deploy another branch, change `branch` in `render.yaml`. For a real launch, remove `DEMO_MODE`, `ALLOW_DEMO_SEED` and `DEMO_RESET_ON_START`, add Stripe and SMTP settings, and create an admin with `npm run admin:create`.

## Payments

If `STRIPE_SECRET_KEY` is empty, payments are simulated end to end. Bookings and packages are confirmed straight away, "Set up payouts" connects a simulated trainer account, and refunds, earnings, payment history and receipts all work. A banner on every page says that no money is taken.

On a production build (`NODE_ENV=production`), simulated payments are switched off unless `DEMO_MODE=true` is set, so a live site without Stripe keys can't hand out free sessions. Without either, clients see "Online payments aren't available yet" instead.

To test real checkout:

1. Put your Stripe **test** secret key in `STRIPE_SECRET_KEY`.
2. Forward webhooks with the [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
3. Copy the `whsec_…` secret it prints into `STRIPE_WEBHOOK_SECRET`. The CLI forwards Connect events too.

How a paid booking works:

1. The client picks a slot. The booking is created as **Awaiting payment** inside a serializable transaction, so two clients can't take the same slot.
2. The client is sent to Stripe Checkout. The session expires after 31 minutes, and the slot is held for 35 minutes.
3. `checkout.session.completed` confirms the booking. `checkout.session.expired` cancels it and frees the slot.
4. If the trainer has finished payouts setup (Stripe Connect Express, from **Payouts** in their dashboard), the payment is a destination charge: it goes to the trainer's account and the platform fee comes back to the platform. Otherwise the platform collects it and holds the trainer's share.
5. Cancelling refunds what the trainer's cancellation policy allows, once. Refunds of destination charges reverse the transfer, and return the platform fee only when the payment is refunded in full.

In production, add a webhook endpoint in the Stripe dashboard pointing at `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `charge.refunded`, and a Connect endpoint at the same URL for `account.updated` and `account.application.deauthorized` (its secret goes in `STRIPE_CONNECT_WEBHOOK_SECRET`).

## Security

- Every Server Action and Route Handler checks the signed-in user and only touches their own data, or requires an admin.
- Passwords are hashed with bcrypt. Five wrong passwords in a row lock the account for 15 minutes. Attempts are counted before the password is checked, so guesses sent in parallel get no more tries.
- Changing or resetting a password, or being suspended, signs the account out everywhere. Password reset links are single use, expire after an hour and are rate limited.
- Uploads are checked by their real file type and size. Verification documents are only served to their trainer and to admins.
- Security headers stop the site being framed and content types being guessed.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests (Playwright; set `E2E_PORT` to pick the port) |
| `npm run db:migrate` | Create and apply a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run admin:create` | Create or promote an admin account |
| `npm run start:demo` | Apply migrations, load demo data and start (used by `render.yaml`) |

Scheduled jobs (reminders, completing sessions, email delivery, daily expiry) are described in [docs/OPERATIONS.md](docs/OPERATIONS.md). How the code is organised is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_PASSWORD` | Yes | At least 32 characters, used to encrypt the session cookie |
| `APP_URL` | Yes in production | Public URL, used in emails, Stripe redirects and the sitemap |
| `CRON_SECRET` | Yes in production | Bearer token for `/api/cron/*` |
| `STRIPE_SECRET_KEY` | For real payments | Enables Stripe Checkout and Connect |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Verifies webhook signatures |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | With Stripe in production | Verifies the Connect endpoint's signatures |
| `DEMO_MODE` | No | `true` allows simulated payments on a production build |
| `ALLOW_DEMO_SEED` | No | `true` allows `npm run db:seed` on a production build |
| `DEMO_RESET_ON_START` | No | `true` makes `npm run start:demo` wipe and reload the demo data on every start |
| `SMTP_URL`, `EMAIL_FROM` | For real email | Without `SMTP_URL`, emails are logged and kept in the admin outbox |
| `PLATFORM_FEE_NEW_CLIENT_PERCENT`, `PLATFORM_FEE_REPEAT_PERCENT` | No | Platform fee rates (defaults 15 and 5) |

## Known gaps and next steps

- **Real Stripe:** everything has been tested with simulated payments and a mocked Stripe client, not yet against a Stripe test account.
- **Held earnings:** payments taken before a trainer finishes payouts setup stay in the platform's Stripe account. Paying them out needs a manual transfer or a transfers job.
- **Currency:** each trainer has one currency and there is no conversion, so the price filter compares numbers across currencies.
- **Deleting a program** deletes the workout logs recorded against it (clients are warned first). Soft deletes would keep that history.
- **Files are stored in the database**, which is fine for a proof of concept; move them to object storage before real traffic.
- **No native app:** the site works on phones and can be installed from the browser.
