# Operations

What the app needs to run outside a laptop: email delivery and scheduled jobs.

## Email

Every email is written to the `EmailOutbox` table first, then delivered.

| Variable | Meaning |
| --- | --- |
| `SMTP_URL` | SMTP connection URL, e.g. `smtps://user:pass@smtp.example.com:465`. Leave empty for **log mode**. |
| `EMAIL_FROM` | Sender, e.g. `PT Platform <no-reply@example.com>`. Defaults to `no-reply@<APP_URL host>`. |
| `APP_URL` | Base URL used for every link in emails and the calendar feed. |

- **Log mode** (no `SMTP_URL`): emails are marked `SENT` without leaving the server and one line is logged per email. Read them in full under **Admin → Email outbox** (`/admin/outbox`).
- Delivery runs right after the request that queued the email (Next.js `after()`), so pages never wait on SMTP. The `deliver-email` cron job sends anything left behind, such as mail queued during a restart or an SMTP outage.
- A failed send is marked `FAILED` with the error. Admins can open it in the outbox and press **Resend**, which queues a fresh copy.
- Users who turn off email notifications in Settings still get security emails (password reset, password changed).
- Password reset emails are limited to 3 per address per hour. Reset links last 1 hour, work once, and using one cancels the others. Only a SHA-256 hash of the token is stored. With SMTP on, the link is also scrubbed from the outbox copy once the email is delivered, so it can't be reused from the outbox or a database dump (in log mode it stays, because the outbox is how you read it).

## Scheduled jobs

Three Route Handlers under `/api/cron/`. Each accepts `GET` or `POST` and must be called with:

```
Authorization: Bearer <CRON_SECRET>
```

Anything else gets `401`. If `CRON_SECRET` is not set, the jobs only run when `NODE_ENV=development`, so a missing secret never leaves them open in production.

| Path | Suggested schedule | What it does |
| --- | --- | --- |
| `/api/cron/reminders` | Every hour | Sends the day-before reminder (in-app and email, to client and trainer) for `CONFIRMED` bookings starting 23 to 25 hours from now whose `reminderSentAt` is empty, then sets `reminderSentAt`. Each booking is claimed before sending, so overlapping or repeated runs never remind twice. Optional `?limit=` (default 200, max 1000). |
| `/api/cron/complete-sessions` | Every hour | Marks `CONFIRMED` bookings that ended more than 12 hours ago as `COMPLETED` and sets `completedAt`. Safe to repeat. |
| `/api/cron/deliver-email` | Every 5 minutes | Sends `QUEUED` emails, oldest first. Rows are locked while sending (`FOR UPDATE SKIP LOCKED`), so parallel runs never send the same email twice. Optional `?limit=` (default 50, max 500). |

Each job answers with a small JSON summary, for example `{"ok":true,"due":3,"sent":3,"failed":0}`.

Example crontab:

```
0 * * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/reminders
5 * * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/complete-sessions
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/deliver-email
```

On Vercel, add the same paths to `vercel.json` `crons` and set `CRON_SECRET` in the project: Vercel sends it as the bearer token.

Locally, with `npm run dev` and no `CRON_SECRET`, you can run a job by opening it in the browser, e.g. `http://localhost:3000/api/cron/reminders`.

## Calendar feeds

Each user has a private feed at `/api/calendar/<calendarToken>` (shown in **Settings → Calendar sync**). It lists their `CONFIRMED` and `COMPLETED` sessions from the last 60 days and the next year, in UTC. The token is the only credential, because calendar apps can't log in; users can reset it from Settings, which stops the old link working. Feeds of suspended accounts return `404`.
