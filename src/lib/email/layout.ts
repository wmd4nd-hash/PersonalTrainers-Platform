/**
 * Branded email layout. Pure: renders the same message as inline-styled HTML
 * (table layout, so it survives Outlook and Gmail) and as plain text.
 */

/** What the outbox stores and the transport sends. */
export type EmailContent = { subject: string; text: string; html: string };

/** Where links in emails point and what the product is called. */
export type EmailEnv = { appName: string; baseUrl: string };

export type EmailDetail = { label: string; value: string; href?: string };

export type EmailLayout = {
  subject: string;
  /** Preview text shown by inboxes next to the subject. */
  preheader?: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  details?: EmailDetail[];
  /** Quoted text from another person (a review, a message, a reviewer's note). */
  quote?: { text: string; attribution?: string };
  action?: { label: string; url: string };
  /** Paragraphs after the button. */
  closing?: string[];
  /** Why the recipient got this email. */
  footer: string;
  footerLink?: { label: string; url: string };
};

const colors = {
  brand: "#0f766e",
  text: "#14171f",
  subtle: "#5d6575",
  line: "#dde1e8",
  page: "#f7f8fa",
  quote: "#eef0f4",
};

const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links make it into emails. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

/** Subjects are a single header line. */
export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function multiline(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function renderHtml(email: EmailLayout, env: EmailEnv): string {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${colors.text};">${multiline(text)}</p>`;

  const details = email.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border-collapse:collapse;border-top:1px solid ${colors.line};">${email.details
        .map((d) => {
          const value = d.href
            ? `<a href="${escapeHtml(safeUrl(d.href))}" style="color:${colors.brand};">${escapeHtml(d.value)}</a>`
            : multiline(d.value);
          return `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid ${colors.line};font-size:14px;line-height:20px;color:${colors.subtle};white-space:nowrap;vertical-align:top;">${escapeHtml(d.label)}</td><td style="padding:10px 0;border-bottom:1px solid ${colors.line};font-size:14px;line-height:20px;color:${colors.text};vertical-align:top;">${value}</td></tr>`;
        })
        .join("")}</table>`
    : "";

  const quote = email.quote
    ? `<div style="margin:0 0 20px;padding:12px 16px;background:${colors.quote};border-left:4px solid ${colors.brand};border-radius:4px;font-size:15px;line-height:22px;color:${colors.text};">${multiline(email.quote.text)}${
        email.quote.attribution
          ? `<div style="margin-top:8px;font-size:13px;color:${colors.subtle};">${escapeHtml(email.quote.attribution)}</div>`
          : ""
      }</div>`
    : "";

  const action = email.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td style="border-radius:8px;background:${colors.brand};"><a href="${escapeHtml(safeUrl(email.action.url))}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(email.action.label)}</a></td></tr></table>`
    : "";

  const footerLink = email.footerLink
    ? ` <a href="${escapeHtml(safeUrl(email.footerLink.url))}" style="color:${colors.subtle};">${escapeHtml(email.footerLink.label)}</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(cleanSubject(email.subject))}</title>
</head>
<body style="margin:0;padding:0;background:${colors.page};font-family:${font};">
${email.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(email.preheader)}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${colors.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-size:18px;font-weight:700;color:${colors.brand};"><a href="${escapeHtml(safeUrl(env.baseUrl))}" style="color:${colors.brand};text-decoration:none;">${escapeHtml(env.appName)}</a></td></tr>
<tr><td style="padding:28px 24px;background:#ffffff;border:1px solid ${colors.line};border-radius:12px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${colors.text};">${escapeHtml(email.heading)}</h1>
${email.greeting ? p(email.greeting) : ""}${email.paragraphs.map(p).join("")}${details}${quote}${action}${(email.closing ?? []).map(p).join("")}
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:${colors.subtle};">${escapeHtml(email.footer)}${footerLink}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderText(email: EmailLayout, env: EmailEnv): string {
  const blocks: string[] = [];
  if (email.greeting) blocks.push(email.greeting);
  blocks.push(...email.paragraphs);
  if (email.details?.length) {
    blocks.push(
      email.details
        .map((d) => `${d.label}: ${d.value}${d.href && d.href !== d.value ? ` (${d.href})` : ""}`)
        .join("\n"),
    );
  }
  if (email.quote) {
    const quoted = email.quote.text
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n");
    blocks.push(email.quote.attribution ? `${quoted}\n> ${email.quote.attribution}` : quoted);
  }
  if (email.action) blocks.push(`${email.action.label}: ${email.action.url}`);
  blocks.push(...(email.closing ?? []));
  const footer = email.footerLink ? `${email.footer} ${email.footerLink.label}: ${email.footerLink.url}` : email.footer;
  blocks.push(`--\n${env.appName} · ${env.baseUrl}\n${footer}`);
  return blocks.join("\n\n") + "\n";
}

export function renderEmail(email: EmailLayout, env: EmailEnv): EmailContent {
  return {
    subject: cleanSubject(email.subject),
    text: renderText(email, env),
    html: renderHtml(email, env),
  };
}
