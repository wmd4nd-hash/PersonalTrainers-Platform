import { describe, expect, it } from "vitest";
import { generateSecret } from "../account";
import { hasRedactedSecrets, redactSecrets } from "./redact";
import { passwordResetEmail } from "./templates";

const env = { appName: "PT Platform", baseUrl: "https://pt.example.com" };

describe("redactSecrets", () => {
  it("removes the token from reset links in both versions of the email", () => {
    const token = generateSecret();
    const email = passwordResetEmail(
      { recipientName: "Sam", url: `https://pt.example.com/reset-password?token=${token}`, expiresInMinutes: 60 },
      env,
    );
    expect(email.text).toContain(token);
    expect(email.html).toContain(token);

    const text = redactSecrets(email.text);
    const html = redactSecrets(email.html);
    expect(text).not.toContain(token);
    expect(html).not.toContain(token);
    expect(text).toContain("https://pt.example.com/reset-password?token=redacted");
    expect(hasRedactedSecrets(text)).toBe(true);
  });

  it("removes every link and handles encoded tokens", () => {
    const content = "a /reset-password?token=abc_DEF-123 b /reset-password?token=x%2By";
    expect(redactSecrets(content)).toBe("a /reset-password?token=redacted b /reset-password?token=redacted");
  });

  it("leaves other emails alone", () => {
    const content = "Your session is booked: https://pt.example.com/dashboard/bookings/abc?token=keep";
    expect(redactSecrets(content)).toBe(content);
    expect(hasRedactedSecrets(content)).toBe(false);
  });
});
