import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  emailPreferencesSchema,
  forgotPasswordSchema,
  notificationListSchema,
  outboxFilterSchema,
  resetPasswordSchema,
  safeInternalPath,
} from "./notifications";

describe("password schemas", () => {
  it("normalises the email for password resets", () => {
    expect(forgotPasswordSchema.parse({ email: " Sam@Example.com " }).email).toBe("sam@example.com");
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("requires matching passwords of at least 8 characters", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", password: "short", confirmPassword: "short" }).success).toBe(false);
    const mismatch = resetPasswordSchema.safeParse({ token: "t", password: "longenough", confirmPassword: "different1" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
    expect(resetPasswordSchema.safeParse({ token: "t", password: "longenough", confirmPassword: "longenough" }).success).toBe(true);
  });

  it("needs the current password and a different new one", () => {
    const base = { currentPassword: "password123", newPassword: "new-password", confirmPassword: "new-password" };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, currentPassword: "" }).success).toBe(false);
    const same = changePasswordSchema.safeParse({ ...base, newPassword: "password123", confirmPassword: "password123" });
    expect(same.success).toBe(false);
  });
});

describe("emailPreferencesSchema", () => {
  it("reads the checkbox", () => {
    expect(emailPreferencesSchema.parse({ emailNotifications: "on" }).emailNotifications).toBe(true);
    expect(emailPreferencesSchema.parse({}).emailNotifications).toBe(false);
  });
});

describe("list filters", () => {
  it("falls back to defaults for bad input", () => {
    expect(notificationListSchema.parse({ filter: "weird", page: "-3" })).toEqual({ filter: "all", page: 1 });
    expect(notificationListSchema.parse({ filter: "unread", page: "2" })).toEqual({ filter: "unread", page: 2 });
    expect(outboxFilterSchema.parse({})).toEqual({ status: "ALL", q: "", page: 1 });
    expect(outboxFilterSchema.parse({ status: "FAILED", q: " sam ", page: "3" })).toEqual({
      status: "FAILED",
      q: "sam",
      page: 3,
    });
  });
});

describe("safeInternalPath", () => {
  it("keeps app paths", () => {
    expect(safeInternalPath("/dashboard/bookings/abc")).toBe("/dashboard/bookings/abc");
    expect(safeInternalPath("/dashboard/packages?purchased=1")).toBe("/dashboard/packages?purchased=1");
  });

  it("rejects links that leave the site", () => {
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("/\\evil.com")).toBeNull();
    expect(safeInternalPath("/ok\nLocation: x")).toBeNull();
  });
});
