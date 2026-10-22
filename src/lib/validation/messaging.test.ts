import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, messageSchema, normalizeMessageBody } from "./messaging";

describe("normalizeMessageBody", () => {
  it("trims and normalises line endings", () => {
    expect(normalizeMessageBody("  Hi\r\nthere\rfriend  \n")).toBe("Hi\nthere\nfriend");
  });

  it("removes null characters", () => {
    expect(normalizeMessageBody("a\u0000b")).toBe("ab");
  });
});

describe("messageSchema", () => {
  it("accepts a normal message", () => {
    expect(messageSchema.parse({ body: " See you at 7:30 " })).toEqual({ body: "See you at 7:30" });
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(messageSchema.safeParse({ body: "   \n " }).success).toBe(false);
    expect(messageSchema.safeParse({}).success).toBe(false);
  });

  it("allows exactly the maximum length", () => {
    expect(messageSchema.safeParse({ body: "a".repeat(MESSAGE_MAX_LENGTH) }).success).toBe(true);
  });

  it("rejects longer messages with a friendly error", () => {
    const result = messageSchema.safeParse({ body: "a".repeat(MESSAGE_MAX_LENGTH + 1) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Keep messages under 2,000 characters");
  });

  it("measures the length after trimming", () => {
    expect(messageSchema.safeParse({ body: `  ${"a".repeat(MESSAGE_MAX_LENGTH)}  ` }).success).toBe(true);
  });
});
