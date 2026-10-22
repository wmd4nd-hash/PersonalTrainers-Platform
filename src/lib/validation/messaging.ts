import { z } from "zod";

/** Longest message body, in characters, after trimming. */
export const MESSAGE_MAX_LENGTH = 2000;

/** Tidies a message body: normalises line endings, drops characters Postgres can't store, trims. */
export function normalizeMessageBody(body: string) {
  return body.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
}

export const messageSchema = z.object({
  body: z
    .string()
    .default("")
    .transform(normalizeMessageBody)
    .pipe(
      z
        .string()
        .min(1, "Write a message first")
        .max(MESSAGE_MAX_LENGTH, `Keep messages under ${MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters`),
    ),
});
