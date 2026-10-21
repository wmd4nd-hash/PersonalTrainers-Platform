# Architecture

How the app is organised and where each feature lives. Read this before changing code.

## Stack

Next.js 16 App Router with Cache Components, React 19, TypeScript, Tailwind 4, PostgreSQL with Prisma 7, iron-session cookies, Stripe. See `AGENTS.md` for Next.js rules (Suspense around request data, `connection()` before reading the clock in shared code).

## Roles

- **CLIENT** books and pays for sessions, buys packages, follows programs.
- **TRAINER** has a `TrainerProfile`, sets availability, takes bookings, builds programs, gets paid.
- **ADMIN** reviews trainer documents, moderates reviews, sees platform data under `/admin`.

`src/lib/auth.ts`: `getCurrentUser()`, `requireUser()`, `requireRole(role)`, `requireAdmin()`, `requireTrainerProfileId()`. Suspended users are treated as signed out.

## Shared modules (contracts)

These are used by several features. Change their signatures only with care.

| Module | Purpose |
| --- | --- |
| `lib/fees.ts` | Platform fee policy: new-client rate (default 15%) on a client's first paid booking or package with a trainer, repeat rate (default 5%) after. Env: `PLATFORM_FEE_NEW_CLIENT_PERCENT`, `PLATFORM_FEE_REPEAT_PERCENT`. |
| `lib/cancellation.ts` | Pure cancellation policy: refund amount, late flag, whether a package credit comes back. |
| `lib/payments.ts` | `beginBookingCheckout`, `beginPackageCheckout` (return a redirect URL), `markBookingPaid`, `markPackagePaid`, `refundBooking`, `refundPackage`, `isNewClient`, `paymentsEnabled`. Without Stripe keys, payments are simulated and succeed immediately. |
| `lib/booking-lifecycle.ts` | `cancelBookingAs(actor, id, reason)`, `completeBookingAs(actor, id)`; applies the policy, refunds, restores credits, fires events. |
| `lib/packages.ts` | `getUsableCredits`, `consumeCredit(tx, …)`, `restoreCredit(tx, …)`. |
| `lib/sessions.ts` | `meetingUrlFor(trainer, bookingId)`: trainer's link or a Jitsi room. |
| `lib/events.ts` | Domain events (`bookingConfirmed`, `bookingCancelled`, `packageActivated`, `reviewPosted`, `messageSent`, `documentReviewed`). Call these after state changes; they decide who is notified. |
| `lib/notify.ts` | `notify({ userId, type, title, body, link, email })` writes an in-app `Notification` and queues an `EmailOutbox` row; `queueEmail()`. |
| `lib/webhooks/` | Stripe webhook dispatch. `checkout.ts` handles Checkout sessions (metadata `kind` = `booking` or `package`), `connect.ts` handles Connect account events, `charges.ts` syncs refunds made in the Stripe dashboard. |
| `lib/nav.ts` | Sidebar links per role. |
| `components/ui.tsx` | Buttons, inputs, cards, badges. Add new shared components as new files. |

## Page slots

Pages that several features contribute to render one component per feature, each in its own file:

- `app/trainers/[id]/page.tsx` renders `booking-form.tsx` (scheduling), `packages-section.tsx` (packages), `reviews-section.tsx` (reviews), `message-button.tsx` (messaging), `favorite-button.tsx` (discovery).
- `components/site-header.tsx` renders `messages-link.tsx` (messaging) and `notification-bell.tsx` (notifications).
- `app/dashboard/_components/booking-review-action.tsx` (reviews) appears on booking lists.
- `app/dashboard/profile/photo-upload.tsx` (trust & admin).

## Feature ownership

| Feature | Owns |
| --- | --- |
| Payments | `lib/payments.ts`, `lib/booking-lifecycle.ts`, `lib/cancellation.ts`, `lib/earnings.ts`, `lib/payment-records.ts`, `lib/webhooks/*`, `app/actions/bookings.ts`, `app/actions/payouts.ts`, `dashboard/payouts`, `dashboard/earnings`, `dashboard/payments`, `api/earnings` |
| Packages | `lib/packages.ts`, `app/actions/packages.ts`, `dashboard/packages`, `trainers/[id]/packages-section.tsx` |
| Reviews | `lib/reviews.ts`, `app/actions/reviews.ts`, `components/rating-summary.tsx`, `trainers/[id]/reviews-section.tsx`, `dashboard/_components/booking-review-action.tsx`, `dashboard/reviews`, `admin/reviews` |
| Messaging | `lib/messaging.ts`, `lib/contact-detection.ts`, `app/actions/messages.ts`, `dashboard/messages`, `trainers/[id]/message-button.tsx`, `components/messages-link.tsx` |
| Notifications & account | `lib/notify.ts`, `lib/events.ts`, `lib/email/*`, `components/notification-bell.tsx`, `dashboard/notifications`, `dashboard/settings`, `api/cron/*`, `api/calendar/*`, `(auth)/forgot-password`, `(auth)/reset-password`, `app/actions/account.ts`, `admin/outbox` |
| Trust & admin | `lib/storage.ts`, `api/files/*`, `app/actions/verification.ts`, `app/actions/admin.ts`, `dashboard/verification`, `dashboard/profile/photo-upload.tsx`, `components/verified-badge.tsx`, `components/avatar.tsx`, `admin` (except reviews and outbox) |
| Discovery | `trainers/page.tsx`, `lib/search.ts`, `lib/matching.ts`, `match`, `components/trainer-card.tsx`, `app/actions/favorites.ts`, `dashboard/favorites`, `trainers/[id]/favorite-button.tsx`, `app/page.tsx`, `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` |
| Scheduling & sessions | `lib/scheduling.ts`, `lib/bookings.ts`, `lib/sessions.ts`, `trainers/[id]/booking-form.tsx`, `dashboard/page.tsx`, `dashboard/bookings/[id]`, `dashboard/calendar`, `dashboard/availability`, `app/actions/trainer.ts` (availability, time off), `app/actions/reschedule.ts` |
| Coaching | `dashboard/programs`, `app/actions/programs.ts`, `dashboard/clients`, `app/actions/clients.ts`, `dashboard/progress`, `app/actions/progress.ts`, `lib/progress.ts` |

Shared by everyone (change only when necessary, keep edits small): `prisma/schema.prisma`, `lib/auth.ts`, `lib/session.ts`, `lib/db.ts`, `lib/validation.ts`, `lib/nav.ts`, `app/layout.tsx`, `components/site-header.tsx`, `components/ui.tsx`, `app/trainers/[id]/page.tsx`, `dashboard/profile/*`, `prisma/seed.ts`. Feature validation schemas go in `lib/validation/<feature>.ts`; feature demo data goes in `prisma/seeds/<feature>.ts`.

## Rules

- Every Server Action and Route Handler re-checks the session and scopes reads and writes to the signed-in user (or requires admin). Never trust ids from a form on their own.
- Money is stored in integer cents with a lowercase ISO currency.
- Anything that reads cookies, `params`, `searchParams` or the database renders inside `<Suspense>`.
- Unit-test pure logic (`*.test.ts` next to the module). Put browser tests in `e2e/<feature>.spec.ts` (Playwright; `npm run test:e2e`, port via `E2E_PORT`).
