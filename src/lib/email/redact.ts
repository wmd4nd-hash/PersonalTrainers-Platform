/**
 * Password reset links are secrets: we only store a hash of the token, but the
 * email itself carries the link. Once it has been delivered over SMTP the
 * outbox copy doesn't need it any more, so the token is scrubbed from it and
 * neither admins reading the outbox nor a database dump can reuse the link.
 * Pure.
 */

const RESET_TOKEN = /(\/reset-password\?token=)[A-Za-z0-9_%-]+/g;

export const REDACTED_TOKEN = "redacted";

export function redactSecrets(content: string): string {
  return content.replace(RESET_TOKEN, `$1${REDACTED_TOKEN}`);
}

/** True for an outbox copy whose secret link was scrubbed after delivery. */
export function hasRedactedSecrets(content: string): boolean {
  return content.includes(`/reset-password?token=${REDACTED_TOKEN}`);
}
