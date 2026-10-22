/**
 * Email copy for every message the platform sends. Pure: callers pass in
 * already-formatted values (times, money) and get back subject, text and HTML.
 */
import { renderEmail, type EmailContent, type EmailDetail, type EmailEnv } from "./layout";

export type { EmailContent, EmailEnv } from "./layout";

function link(env: EmailEnv, path: string): string {
  return new URL(path, env.baseUrl).toString();
}

const notificationFooter = (env: EmailEnv) => ({
  footer: "You're getting this email because email notifications are on for your account.",
  footerLink: { label: "Change email settings", url: link(env, "/dashboard/settings") },
});

const securityFooter = {
  footer: "This is a security email about your account, so we send it even when other email notifications are off.",
};

const hi = (name: string) => `Hi ${firstName(name)},`;

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

/** Shortens text for previews, preferably on a word boundary, ending with "…". */
export function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** 60 -> "1 hour", 120 -> "2 hours", 30 -> "30 minutes". */
export function formatLifetime(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function stars(rating: number): string {
  const r = Math.min(5, Math.max(0, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

// ---------------------------------------------------------------------------
// Sessions

export type SessionInfo = {
  bookingId: string;
  /** Already formatted, with the timezone, e.g. "Tue, Mar 10, 10:00 AM GMT". */
  when: string;
  minutes: number;
  format: "IN_PERSON" | "ONLINE";
  location: string;
  meetingUrl: string | null;
};

function sessionDetails(session: SessionInfo, withName?: { label: string; name: string }): EmailDetail[] {
  const details: EmailDetail[] = [];
  if (withName) details.push({ label: withName.label, value: withName.name });
  details.push({ label: "When", value: session.when }, { label: "Length", value: `${session.minutes} minutes` });
  if (session.format === "ONLINE") {
    details.push(
      session.meetingUrl
        ? { label: "Where", value: "Online video call", href: session.meetingUrl }
        : { label: "Where", value: "Online. The video link is on the booking page." },
    );
  } else {
    details.push({ label: "Where", value: session.location || "In person. Agree the place with each other." });
  }
  return details;
}

const bookingPath = (session: SessionInfo) => `/dashboard/bookings/${session.bookingId}`;

export function bookingConfirmedClientEmail(
  input: {
    recipientName: string;
    trainerName: string;
    session: SessionInfo;
    /** e.g. "£65.00 by card" or "1 session from 10-session pack". */
    payment: string;
    /** Trainer's cancellation policy in plain words. */
    policy: string;
  },
  env: EmailEnv,
): EmailContent {
  const { session } = input;
  return renderEmail(
    {
      subject: `You're booked with ${input.trainerName}`,
      preheader: `${session.when}. Everything you need for your session.`,
      heading: "Your session is booked",
      greeting: hi(input.recipientName),
      paragraphs: [`Your session with ${input.trainerName} is confirmed. Here are the details:`],
      details: [
        ...sessionDetails(session, { label: "Trainer", name: input.trainerName }),
        { label: "Paid", value: input.payment },
      ],
      action: { label: "View booking", url: link(env, bookingPath(session)) },
      closing: [
        `${input.policy} You can cancel from the booking page.`,
        "We'll send you a reminder the day before.",
      ],
      ...notificationFooter(env),
    },
    env,
  );
}

export function bookingConfirmedTrainerEmail(
  input: {
    recipientName: string;
    clientName: string;
    session: SessionInfo;
    payment: string;
    notes: string;
  },
  env: EmailEnv,
): EmailContent {
  const { session } = input;
  return renderEmail(
    {
      subject: `New booking from ${input.clientName}`,
      preheader: `${input.clientName} booked ${session.when}.`,
      heading: "You have a new booking",
      greeting: hi(input.recipientName),
      paragraphs: [`${input.clientName} booked a session with you.`],
      details: [...sessionDetails(session, { label: "Client", name: input.clientName }), { label: "Paid", value: input.payment }],
      quote: input.notes.trim() ? { text: input.notes.trim(), attribution: `Note from ${input.clientName}` } : undefined,
      action: { label: "View booking", url: link(env, bookingPath(session)) },
      ...notificationFooter(env),
    },
    env,
  );
}

export type CancelledBy = "you" | "them" | "admin";

export function bookingCancelledEmail(
  input: {
    recipientName: string;
    /** Whether the recipient is the client or the trainer of the session. */
    audience: "client" | "trainer";
    otherName: string;
    session: SessionInfo;
    cancelledBy: CancelledBy;
    reason: string;
    /** Formatted amount refunded to the client, if any. */
    refund: string | null;
    /** Formatted amount the client was still charged (late cancellation), if any. */
    kept: string | null;
    /** The session was paid with a package credit. */
    packageSession: boolean;
  },
  env: EmailEnv,
): EmailContent {
  const { session, otherName, audience } = input;
  const subject =
    input.cancelledBy === "you"
      ? `You cancelled your session on ${session.when}`
      : input.cancelledBy === "admin"
        ? `Your session on ${session.when} was cancelled`
        : audience === "client"
          ? `${otherName} cancelled your session`
          : `${otherName} cancelled their session`;

  const opening =
    input.cancelledBy === "you"
      ? `You cancelled your session with ${otherName} on ${session.when}.`
      : input.cancelledBy === "admin"
        ? `Our team cancelled your session with ${otherName} on ${session.when}. Sorry for the trouble.`
        : audience === "client"
          ? `Sorry, ${otherName} had to cancel your session on ${session.when}.`
          : `${otherName} cancelled the session on ${session.when}. That time is free again in your calendar.`;

  const paragraphs = [opening];
  if (audience === "client") {
    if (input.refund) {
      paragraphs.push(
        `We're refunding ${input.refund} to your card. Refunds usually take 5 to 10 business days to show on your statement.`,
      );
    }
    if (input.kept) {
      paragraphs.push(
        `Because the session was cancelled late, ${input.kept} was kept under ${otherName}'s cancellation policy.`,
      );
    }
    if (input.packageSession) {
      paragraphs.push("This session was booked with a package. Check My packages to see how many sessions you have left.");
    }
  } else if (input.kept) {
    paragraphs.push(`It was a late cancellation, so the client was still charged ${input.kept} under your policy.`);
  }

  const reasonAttribution =
    input.cancelledBy === "you"
      ? "Your reason"
      : input.cancelledBy === "admin"
        ? `Reason from the ${env.appName} team`
        : `Reason from ${otherName}`;

  return renderEmail(
    {
      subject,
      preheader: input.refund && audience === "client" ? `A refund of ${input.refund} is on its way.` : opening,
      heading: "Session cancelled",
      greeting: hi(input.recipientName),
      paragraphs,
      details: [
        { label: audience === "client" ? "Trainer" : "Client", value: otherName },
        { label: "When", value: session.when },
      ],
      quote: input.reason.trim() ? { text: input.reason.trim(), attribution: reasonAttribution } : undefined,
      action:
        audience === "client"
          ? { label: "Book another session", url: link(env, "/trainers") }
          : { label: "View booking", url: link(env, bookingPath(session)) },
      ...notificationFooter(env),
    },
    env,
  );
}

export function bookingReminderEmail(
  input: {
    recipientName: string;
    audience: "client" | "trainer";
    otherName: string;
    session: SessionInfo;
  },
  env: EmailEnv,
): EmailContent {
  const { session, otherName } = input;
  const withWhom = input.audience === "client" ? `with ${otherName}` : `with your client ${otherName}`;
  const online = session.format === "ONLINE";
  return renderEmail(
    {
      subject: `Reminder: your session ${withWhom} is tomorrow`,
      preheader: `${session.when}.`,
      heading: "Your session is tomorrow",
      greeting: hi(input.recipientName),
      paragraphs: [`Just a reminder that your session ${withWhom} is coming up.`],
      details: sessionDetails(session, { label: input.audience === "client" ? "Trainer" : "Client", name: otherName }),
      action:
        online && session.meetingUrl
          ? { label: "Join video call", url: session.meetingUrl }
          : { label: "View booking", url: link(env, bookingPath(session)) },
      closing: [
        input.audience === "client"
          ? online
            ? "Find a quiet spot with enough room to move, and test your camera a few minutes before."
            : "Bring water and a towel, and wear something comfortable to move in."
          : "Check the booking for any notes from your client before the session.",
        `Can't make it? Let ${otherName} know as soon as possible from the booking page.`,
      ],
      ...notificationFooter(env),
    },
    env,
  );
}

// ---------------------------------------------------------------------------
// Packages

export function packageActivatedClientEmail(
  input: {
    recipientName: string;
    trainerName: string;
    trainerId: string;
    packageTitle: string;
    sessions: number;
    price: string;
    /** Formatted date, e.g. "June 30, 2026". */
    expiresOn: string;
  },
  env: EmailEnv,
): EmailContent {
  return renderEmail(
    {
      subject: `${input.packageTitle} is ready to use`,
      preheader: `${input.sessions} sessions with ${input.trainerName}, ready to book.`,
      heading: "Your package is ready",
      greeting: hi(input.recipientName),
      paragraphs: [
        `Thanks for buying ${input.packageTitle}. You can now book ${input.sessions} sessions with ${input.trainerName} without paying each time.`,
      ],
      details: [
        { label: "Package", value: input.packageTitle },
        { label: "Trainer", value: input.trainerName },
        { label: "Sessions", value: String(input.sessions) },
        { label: "Paid", value: input.price },
        { label: "Use by", value: input.expiresOn },
      ],
      action: { label: "Book a session", url: link(env, `/trainers/${input.trainerId}`) },
      closing: ["When you book, choose your package under “Pay with”."],
      ...notificationFooter(env),
    },
    env,
  );
}

export function packageActivatedTrainerEmail(
  input: {
    recipientName: string;
    clientName: string;
    packageTitle: string;
    sessions: number;
    price: string;
  },
  env: EmailEnv,
): EmailContent {
  return renderEmail(
    {
      subject: `${input.clientName} bought ${input.packageTitle}`,
      preheader: `${input.price} for ${input.sessions} sessions.`,
      heading: "You sold a package",
      greeting: hi(input.recipientName),
      paragraphs: [
        `${input.clientName} bought ${input.packageTitle}. They can now book ${input.sessions} sessions with you from your profile.`,
      ],
      details: [
        { label: "Client", value: input.clientName },
        { label: "Package", value: input.packageTitle },
        { label: "Sessions", value: String(input.sessions) },
        { label: "Price", value: input.price },
      ],
      action: { label: "View packages", url: link(env, "/dashboard/packages") },
      ...notificationFooter(env),
    },
    env,
  );
}

// ---------------------------------------------------------------------------
// Reviews, messages, verification

export function reviewPostedEmail(
  input: { recipientName: string; clientName: string; rating: number; comment: string },
  env: EmailEnv,
): EmailContent {
  return renderEmail(
    {
      subject: `${input.clientName} left you a ${input.rating}-star review`,
      preheader: input.comment ? truncate(input.comment, 90) : `${stars(input.rating)} from ${input.clientName}`,
      heading: "You have a new review",
      greeting: hi(input.recipientName),
      paragraphs: [`${input.clientName} reviewed their session with you: ${stars(input.rating)} (${input.rating} out of 5).`],
      quote: input.comment.trim() ? { text: truncate(input.comment, 1000), attribution: input.clientName } : undefined,
      action: { label: "Read and reply", url: link(env, "/dashboard/reviews") },
      closing: ["A short, friendly reply shows future clients you care."],
      ...notificationFooter(env),
    },
    env,
  );
}

export function messageReceivedEmail(
  input: { recipientName: string; senderName: string; preview: string; link: string },
  env: EmailEnv,
): EmailContent {
  return renderEmail(
    {
      subject: `New message from ${input.senderName}`,
      preheader: truncate(input.preview, 90),
      heading: `${input.senderName} sent you a message`,
      greeting: hi(input.recipientName),
      paragraphs: [],
      quote: { text: truncate(input.preview, 500), attribution: input.senderName },
      action: { label: "Reply", url: link(env, input.link) },
      closing: ["For your safety, keep conversations and payments on the platform."],
      ...notificationFooter(env),
    },
    env,
  );
}

export function documentReviewedEmail(
  input: { recipientName: string; approved: boolean; documentLabel: string; note: string },
  env: EmailEnv,
): EmailContent {
  const note = input.note.trim();
  return renderEmail(
    input.approved
      ? {
          subject: `Your ${input.documentLabel} was approved`,
          preheader: "Thanks for helping keep clients safe.",
          heading: "Document approved",
          greeting: hi(input.recipientName),
          paragraphs: [
            `Good news: we checked your ${input.documentLabel} and approved it.`,
            "Verified trainers get a badge on their profile, which helps clients choose with confidence.",
          ],
          quote: note ? { text: note, attribution: "Note from our team" } : undefined,
          action: { label: "View verification", url: link(env, "/dashboard/verification") },
          ...notificationFooter(env),
        }
      : {
          subject: `Your ${input.documentLabel} needs attention`,
          preheader: note ? truncate(note, 90) : "Please upload a new copy.",
          heading: "We couldn't approve your document",
          greeting: hi(input.recipientName),
          paragraphs: [`We checked your ${input.documentLabel} but couldn't approve it this time.`],
          quote: note ? { text: note, attribution: "Note from our team" } : undefined,
          action: { label: "Upload a new document", url: link(env, "/dashboard/verification") },
          closing: ["Make sure the whole document is visible, readable and still valid."],
          ...notificationFooter(env),
        },
    env,
  );
}

// ---------------------------------------------------------------------------
// Account

export function passwordResetEmail(
  input: { recipientName: string; url: string; expiresInMinutes: number },
  env: EmailEnv,
): EmailContent {
  const lifetime = formatLifetime(input.expiresInMinutes);
  return renderEmail(
    {
      subject: "Reset your password",
      preheader: `This link works for ${lifetime} and can be used once.`,
      heading: "Reset your password",
      greeting: hi(input.recipientName),
      paragraphs: [
        `We got a request to reset the password for your ${env.appName} account. Use the button below to choose a new one.`,
      ],
      action: { label: "Choose a new password", url: input.url },
      closing: [
        `The link works for ${lifetime} and can be used once.`,
        "If you didn't ask for this, you can ignore this email. Your password won't change.",
      ],
      footer: "You're getting this email because someone asked to reset the password for this address.",
    },
    env,
  );
}

export function passwordChangedEmail(input: { recipientName: string }, env: EmailEnv): EmailContent {
  return renderEmail(
    {
      subject: "Your password was changed",
      preheader: "If this was you, there's nothing else to do.",
      heading: "Your password was changed",
      greeting: hi(input.recipientName),
      paragraphs: [
        `The password for your ${env.appName} account was just changed. If this was you, there's nothing else to do.`,
        "If you didn't change it, reset your password straight away to secure your account.",
      ],
      action: { label: "Reset password", url: link(env, "/forgot-password") },
      ...securityFooter,
    },
    env,
  );
}

/** Fallback for notifications without their own template. */
export function notificationEmail(
  input: { recipientName: string; title: string; body?: string; link?: string },
  env: EmailEnv,
): EmailContent {
  const body = input.body?.trim();
  return renderEmail(
    {
      subject: input.title,
      preheader: body ? truncate(body, 90) : undefined,
      heading: input.title,
      greeting: hi(input.recipientName),
      paragraphs: body ? [body] : [],
      action: input.link ? { label: "View details", url: link(env, input.link) } : undefined,
      ...notificationFooter(env),
    },
    env,
  );
}
