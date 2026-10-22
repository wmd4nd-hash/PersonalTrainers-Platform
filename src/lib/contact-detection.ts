/**
 * Spots messages that try to move a client and trainer off the platform:
 * contact details (emails, phone numbers, links, social handles) and cues for
 * paying or talking elsewhere. Pure and dependency-free so it can run anywhere.
 *
 * It leans towards flagging, because a flag only adds a friendly notice. The
 * numbers people use in fitness chat (times, prices, weights, reps, dates) must
 * not trip it.
 */

export type ContactReason = "email" | "phone" | "url" | "off_platform";

export type ContactDetection = {
  flagged: boolean;
  /** Each kind of contact detail found, in a stable order. */
  reasons: ContactReason[];
};

const REASON_ORDER: ContactReason[] = ["email", "phone", "url", "off_platform"];

/**
 * Top-level domains treated as a link even without "http://" or "www.". Short
 * ones that are also common words or abbreviations (i.e., no., at, to) are left
 * out on purpose.
 */
const TLDS = [
  "com", "net", "org", "io", "co", "me", "app", "dev", "link", "ly", "gl", "gg", "ee", "tv",
  "uk", "us", "ca", "au", "nz", "de", "fr", "es", "pt", "nl", "be", "ch", "se", "dk", "fi",
  "pl", "jp", "ae", "br", "mx", "info", "biz", "xyz", "site", "online", "store", "shop",
  "fit", "fitness", "coach", "health", "page", "bio",
].join("|");

const TLD_END = String.raw`(?:${TLDS})(?![\w-])`;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const EMAILS = new RegExp(EMAIL.source, "gi");

/** "@" or "." spelled out or bracketed: "(at)", "[dot]", " at ", " dot ". */
const AT = String.raw`(?:\s*[\[({]\s*(?:at|@)\s*[\])}]\s*|\s+at\s+)`;
const DOT = String.raw`(?:\.|\s*[\[({]\s*(?:dot|\.)\s*[\])}]\s*|\s+dot\s+)`;

// "sam at gmail dot com", "sam [at] gmail [dot] com", "sam(at)gmail.com"
const OBFUSCATED_EMAIL = new RegExp(
  String.raw`[a-z0-9._%+-]+${AT}[a-z0-9-]+(?:${DOT}[a-z0-9-]+)*?${DOT}${TLD_END}`,
  "i",
);

const URL_WITH_SCHEME = /\b(?:https?:\/\/|www\.)\S+/i;
const URLS_WITH_SCHEME = new RegExp(URL_WITH_SCHEME.source, "gi");

// Bare domains such as "samfit.co.uk/book", "wa.me/4477…" or "linktr.ee/sam".
const BARE_DOMAIN = new RegExp(
  String.raw`(?<![\w@.-])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.${TLD_END}`,
  "i",
);

// "samfit dot com", "samfit (dot) co (dot) uk"
const OBFUSCATED_DOMAIN = new RegExp(
  String.raw`\b[a-z0-9-]{2,}(?:\s*[\[({]\s*(?:dot|\.)\s*[\])}]\s*|\s+dot\s+)${TLD_END}`,
  "i",
);

/** Words that follow "@" in everyday chat, e.g. "see you @gym". */
const HANDLE_ALLOWLIST = new Set(["gym", "home", "work", "park", "studio", "office", "the", "noon"]);

// A social handle like "@sam.lifts" that isn't part of an email address.
const HANDLE = /(?<![\w@.])@([a-z0-9._]{3,30})/gi;

/** A word that follows "on"/"at" and keeps the conversation here. */
const STAYS_HERE = String.raw`(?:here|this|the\s+(?:app|platform|site|website)|pt\s+platform)\b`;
const SOCIALS = String.raw`(?:instagram|insta|ig|facebook|fb|tiktok|snapchat|snap|twitter|socials|handle)`;
const CONTACTS = String.raw`(?:number|phone|cell|mobile|e-?mail|whatsapp|${SOCIALS})`;

const OFF_PLATFORM_CUES = [
  // Messaging apps.
  String.raw`whats\s?app`,
  "telegram",
  "viber",
  "wechat",
  "kik",
  "skype",
  "snapchat",
  String.raw`(?:fb|facebook)\s+messenger`,
  String.raw`on\s+signal`,
  String.raw`signal\s+me`,
  // Social profiles shared on purpose.
  String.raw`my\s+${SOCIALS}`,
  String.raw`${SOCIALS}\s*[:@]`,
  String.raw`(?:add|follow|find|dm|message)\s+me\s+on\s+${SOCIALS}`,
  // Payment apps and bank details.
  "venmo",
  "paypal",
  String.raw`cash\s?app`,
  "zelle",
  "revolut",
  "monzo",
  "bizum",
  String.raw`mb\s?way`,
  "twint",
  "vipps",
  "mobilepay",
  "interac",
  "iban",
  String.raw`sort\s+code`,
  String.raw`account\s+number`,
  String.raw`bank\s+(?:details|transfer|account)`,
  String.raw`wire\s+transfer`,
  String.raw`e-?transfer`,
  // Asking to talk elsewhere.
  String.raw`te?xt\s+me`,
  String.raw`sms\s+me`,
  String.raw`call\s+me\s+(?:on|at)`,
  String.raw`give\s+me\s+a\s+(?:call|ring|text|bell)`,
  String.raw`ring\s+me`,
  String.raw`e-?mail\s+me`,
  String.raw`dm\s+me`,
  String.raw`(?:message|msg|reach|contact|find|add|follow)\s+me\s+(?:on|at|via|through)(?=\s+(?!${STAYS_HERE})\S)`,
  String.raw`(?:message|msg|reach|contact|pay)\s+me\s+directly`,
  String.raw`hit\s+me\s+up\s+on(?=\s+(?!${STAYS_HERE})\S)`,
  String.raw`my\s+(?:(?:phone|cell|mobile|whatsapp|work|personal)\s+)?number(?!\s+of\b)`,
  String.raw`my\s+(?:phone|cell|mobile|whatsapp|e-?mail)(?:\s+address)?\s*(?:is|:)`,
  String.raw`phone\s+(?:number|no\.?|#)`,
  String.raw`(?:send|give|share|what'?s|whats)\s+(?:me\s+)?your\s+${CONTACTS}`,
  // Paying outside the platform.
  String.raw`pay\s+(?:me\s+|you\s+)?(?:directly|in\s+cash|cash|outside)`,
  String.raw`cash\s+(?:only|in\s+hand)`,
  String.raw`(?:outside|off)\s+(?:of\s+)?(?:the\s+)?(?:app|platform|site|website)`,
  String.raw`(?:avoid|skip|dodge|save\s+on|without)\s+(?:the\s+|any\s+)?(?:platform\s+|booking\s+|service\s+)?fees?`,
];

const OFF_PLATFORM = new RegExp(String.raw`(?<![\w])(?:${OFF_PLATFORM_CUES.join("|")})(?![\w])`, "i");

// International bank account numbers, e.g. "GB29 NWBK 6016 1331 9268 19".
const IBAN = /\b[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){3,7}(?:\s?[a-z0-9]{1,3})?\b/i;

/** Times ("14:30") and dates ("22/10/2026", "2026-10-22") are never phone numbers. */
const CLOCK_TIME = /(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?!\d)/g;
const DATE = /(?<![\d./-])(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))(?![\d./-])/g;

/**
 * Runs of digits joined by phone-style separators (spaces, dots, dashes,
 * slashes and brackets), with an optional leading "+".
 */
const DIGIT_RUN = /(?<![\w.,:/-])\+?\(?\d(?:[\s().\/-]{1,3}\d|\d)*(?!\w)/g;

const NUMBER_WORD = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)`;
// Seven or more digits spelled out: "zero seven seven zero zero nine…"
const SPELLED_NUMBER = new RegExp(String.raw`\b${NUMBER_WORD}(?:[\s,.-]+${NUMBER_WORD}){6,}\b`, "i");

/** A unit right after a number means it's a measurement. */
const UNIT_AFTER =
  /^\s*(?:kg|kgs|kilos?|lbs?|pounds|g|km|k|mi|miles?|m|cm|mm|reps?|sets?|rounds?|x|%|mins?|minutes?|secs?|seconds?|hrs?|hours?|days?|weeks?|cal|kcal|calories|steps|bpm)\b/i;
/** A currency right before a number means it's a price. */
const CURRENCY_BEFORE = /(?:[£$€¥₹]|\b(?:usd|gbp|eur|aed|jpy|chf|cad|aud))\s*$/i;

function normalize(text: string) {
  // NFKC folds full-width digits and letters; zero-width characters hide splits.
  return text.normalize("NFKC").replace(/[​-‍⁠﻿­]/g, "");
}

/** True when this run of digits reads like a phone number. */
function isPhoneLike(run: string, before: string, after: string) {
  if (CURRENCY_BEFORE.test(before) || UNIT_AFTER.test(after)) return false;
  // ZIP+4 codes, e.g. 10023-4567.
  if (/^\d{5}-\d{4}$/.test(run)) return false;
  // A list of decimals (weights, UK-style times like 7.30) is not a phone number.
  const tokens = run.split(/\s+/);
  if (tokens.length > 1 && tokens.every((t) => /^\d{1,3}\.\d{1,2}$/.test(t))) return false;

  const digits = run.replace(/\D/g, "").length;
  const international = run.startsWith("+") || run.startsWith("00");
  return digits <= 15 && digits >= (international ? 8 : 9);
}

function hasPhoneNumber(text: string) {
  const cleaned = text.replace(CLOCK_TIME, " ; ").replace(DATE, " ; ");
  for (const match of cleaned.matchAll(DIGIT_RUN)) {
    const run = match[0];
    const start = match.index;
    const before = cleaned.slice(Math.max(0, start - 4), start);
    const after = cleaned.slice(start + run.length, start + run.length + 12);
    if (isPhoneLike(run, before, after)) return true;
  }
  return SPELLED_NUMBER.test(text);
}

function hasSocialHandle(text: string) {
  for (const match of text.matchAll(HANDLE)) {
    const handle = match[1]!.replace(/[._]+$/, "").toLowerCase();
    if (handle.length < 3 || !/[a-z]/.test(handle)) continue;
    // Times written as "@5pm" or "@7.30am".
    if (/^\d{1,2}(?:[.:]\d{2})?(?:am|pm)$/.test(handle)) continue;
    if (HANDLE_ALLOWLIST.has(handle)) continue;
    return true;
  }
  return false;
}

/** Finds contact details and off-platform cues in a message. */
export function detectContactDetails(input: string): ContactDetection {
  const text = normalize(input);
  const found = new Set<ContactReason>();

  if (EMAIL.test(text) || OBFUSCATED_EMAIL.test(text)) found.add("email");
  // Check what's left so an email's domain and digits don't count twice.
  const withoutEmails = text.replace(EMAILS, " ");

  if (URL_WITH_SCHEME.test(withoutEmails) || BARE_DOMAIN.test(withoutEmails) || OBFUSCATED_DOMAIN.test(withoutEmails)) {
    found.add("url");
  }
  // Links carry digits of their own (wa.me/447700900123); look for numbers elsewhere.
  const withoutLinks = withoutEmails.replace(URLS_WITH_SCHEME, " ");

  if (hasPhoneNumber(withoutLinks)) found.add("phone");
  if (OFF_PLATFORM.test(text) || IBAN.test(text) || hasSocialHandle(withoutEmails)) found.add("off_platform");

  const reasons = REASON_ORDER.filter((r) => found.has(r));
  return { flagged: reasons.length > 0, reasons };
}

/** Shorthand for `detectContactDetails(text).flagged`. */
export function containsContactDetails(text: string): boolean {
  return detectContactDetails(text).flagged;
}
