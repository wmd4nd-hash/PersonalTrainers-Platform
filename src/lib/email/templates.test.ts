import { describe, expect, it } from "vitest";
import { cleanSubject, escapeHtml, renderEmail } from "./layout";
import {
  bookingCancelledEmail,
  bookingConfirmedClientEmail,
  bookingConfirmedTrainerEmail,
  bookingReminderEmail,
  documentReviewedEmail,
  firstName,
  formatLifetime,
  messageReceivedEmail,
  notificationEmail,
  packageActivatedClientEmail,
  passwordChangedEmail,
  passwordResetEmail,
  reviewPostedEmail,
  stars,
  truncate,
  type SessionInfo,
} from "./templates";

const env = { appName: "PT Platform", baseUrl: "https://pt.example.com" };

const inPerson: SessionInfo = {
  bookingId: "b1",
  when: "Tue, Mar 10, 10:00 AM GMT",
  minutes: 60,
  format: "IN_PERSON",
  location: "PureGym Camden",
  meetingUrl: null,
};

const online: SessionInfo = { ...inPerson, format: "ONLINE", location: "", meetingUrl: "https://meet.jit.si/ptp-b1" };

describe("layout", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });

  it("keeps subjects on one line", () => {
    expect(cleanSubject("Hello\r\nBcc: evil@example.com")).toBe("Hello Bcc: evil@example.com");
  });

  it("renders the same content as HTML and plain text", () => {
    const email = renderEmail(
      {
        subject: "Subject",
        heading: "Heading",
        greeting: "Hi Sam,",
        paragraphs: ["First line.\nSecond line."],
        details: [{ label: "When", value: "Tomorrow" }],
        action: { label: "Open", url: "https://pt.example.com/x" },
        footer: "Footer text.",
      },
      env,
    );
    expect(email.subject).toBe("Subject");
    expect(email.html).toContain("<!doctype html>");
    expect(email.html).toContain("First line.<br>Second line.");
    expect(email.html).toContain('href="https://pt.example.com/x"');
    expect(email.text).toContain("Hi Sam,\n\nFirst line.\nSecond line.");
    expect(email.text).toContain("When: Tomorrow");
    expect(email.text).toContain("Open: https://pt.example.com/x");
    expect(email.text).toContain("Footer text.");
  });

  it("escapes user content and refuses non-http links", () => {
    const email = renderEmail(
      {
        subject: "x",
        heading: "<script>alert(1)</script>",
        paragraphs: [],
        quote: { text: "<img src=x onerror=alert(1)>" },
        action: { label: "Click", url: "javascript:alert(1)" },
        footer: "f",
      },
      env,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("javascript:");
  });
});

describe("helpers", () => {
  it("uses the first name in greetings", () => {
    expect(firstName("Maya Okafor")).toBe("Maya");
    expect(firstName("  ")).toBe("there");
  });

  it("truncates on a word boundary", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("one two three four five", 16)).toBe("one two three…");
    expect(truncate("abcdefghijklmnop", 8)).toBe("abcdefg…");
  });

  it("draws star ratings", () => {
    expect(stars(4)).toBe("★★★★☆");
    expect(stars(9)).toBe("★★★★★");
  });

  it("describes link lifetimes", () => {
    expect(formatLifetime(60)).toBe("1 hour");
    expect(formatLifetime(120)).toBe("2 hours");
    expect(formatLifetime(30)).toBe("30 minutes");
  });
});

describe("booking emails", () => {
  it("confirms a booking to the client with everything they need", () => {
    const email = bookingConfirmedClientEmail(
      {
        recipientName: "Sam Client",
        trainerName: "Maya Okafor",
        session: inPerson,
        payment: "£65.00 by card",
        policy: "Free cancellation up to 24 hours before the session.",
      },
      env,
    );
    expect(email.subject).toBe("You're booked with Maya Okafor");
    expect(email.text).toContain("Hi Sam,");
    expect(email.text).toContain("When: Tue, Mar 10, 10:00 AM GMT");
    expect(email.text).toContain("Where: PureGym Camden");
    expect(email.text).toContain("Paid: £65.00 by card");
    expect(email.text).toContain("https://pt.example.com/dashboard/bookings/b1");
    expect(email.text).toContain("https://pt.example.com/dashboard/settings");
  });

  it("includes the video link for online sessions", () => {
    const email = bookingConfirmedClientEmail(
      { recipientName: "Sam", trainerName: "Aiko", session: online, payment: "$45.00 by card", policy: "" },
      env,
    );
    expect(email.text).toContain("Where: Online video call (https://meet.jit.si/ptp-b1)");
    expect(email.html).toContain('href="https://meet.jit.si/ptp-b1"');
  });

  it("tells the trainer who booked and passes on the client's note", () => {
    const email = bookingConfirmedTrainerEmail(
      { recipientName: "Maya Okafor", clientName: "Sam Client", session: inPerson, payment: "£65.00 by card", notes: "Knee injury" },
      env,
    );
    expect(email.subject).toBe("New booking from Sam Client");
    expect(email.text).toContain("> Knee injury");
  });

  it("explains refunds when a trainer cancels", () => {
    const email = bookingCancelledEmail(
      {
        recipientName: "Sam",
        audience: "client",
        otherName: "Maya Okafor",
        session: inPerson,
        cancelledBy: "them",
        reason: "I'm unwell",
        refund: "£65.00",
        kept: null,
        packageSession: false,
      },
      env,
    );
    expect(email.subject).toBe("Maya Okafor cancelled your session");
    expect(email.text).toContain("We're refunding £65.00 to your card.");
    expect(email.text).toContain("> I'm unwell");
  });

  it("explains a late cancellation fee to the client who cancelled", () => {
    const email = bookingCancelledEmail(
      {
        recipientName: "Sam",
        audience: "client",
        otherName: "Maya Okafor",
        session: inPerson,
        cancelledBy: "you",
        reason: "",
        refund: "£32.50",
        kept: "£32.50",
        packageSession: false,
      },
      env,
    );
    expect(email.subject).toBe("You cancelled your session on Tue, Mar 10, 10:00 AM GMT");
    expect(email.text).toContain("We're refunding £32.50");
    expect(email.text).toContain("£32.50 was kept under Maya Okafor's cancellation policy");
  });

  it("tells the trainer their time is free again", () => {
    const email = bookingCancelledEmail(
      {
        recipientName: "Maya",
        audience: "trainer",
        otherName: "Sam Client",
        session: inPerson,
        cancelledBy: "them",
        reason: "",
        refund: "£65.00",
        kept: null,
        packageSession: false,
      },
      env,
    );
    expect(email.subject).toBe("Sam Client cancelled their session");
    expect(email.text).toContain("That time is free again");
    expect(email.text).not.toContain("refunding");
  });

  it("reminds the client the day before with a join link for video sessions", () => {
    const email = bookingReminderEmail({ recipientName: "Sam", audience: "client", otherName: "Aiko", session: online }, env);
    expect(email.subject).toBe("Reminder: your session with Aiko is tomorrow");
    expect(email.text).toContain("Join video call: https://meet.jit.si/ptp-b1");
  });
});

describe("other emails", () => {
  it("announces an activated package", () => {
    const email = packageActivatedClientEmail(
      {
        recipientName: "Sam",
        trainerName: "Maya",
        trainerId: "t1",
        packageTitle: "5-session pack",
        sessions: 5,
        price: "£300.00",
        expiresOn: "June 30, 2026",
      },
      env,
    );
    expect(email.subject).toBe("5-session pack is ready to use");
    expect(email.text).toContain("Book a session: https://pt.example.com/trainers/t1");
  });

  it("quotes reviews and messages", () => {
    const review = reviewPostedEmail({ recipientName: "Maya", clientName: "Sam", rating: 5, comment: "Brilliant" }, env);
    expect(review.subject).toBe("Sam left you a 5-star review");
    expect(review.text).toContain("> Brilliant");

    const message = messageReceivedEmail(
      { recipientName: "Maya", senderName: "Sam", preview: "See you Tuesday", link: "/dashboard/messages/c1" },
      env,
    );
    expect(message.subject).toBe("New message from Sam");
    expect(message.text).toContain("Reply: https://pt.example.com/dashboard/messages/c1");
  });

  it("explains a rejected document with the reviewer's note", () => {
    const email = documentReviewedEmail(
      { recipientName: "Maya", approved: false, documentLabel: "insurance certificate", note: "It has expired." },
      env,
    );
    expect(email.subject).toBe("Your insurance certificate needs attention");
    expect(email.text).toContain("> It has expired.");
  });

  it("sends password reset links without a notification-settings footer", () => {
    const email = passwordResetEmail(
      { recipientName: "Sam", url: "https://pt.example.com/reset-password?token=abc", expiresInMinutes: 60 },
      env,
    );
    expect(email.subject).toBe("Reset your password");
    expect(email.text).toContain("Choose a new password: https://pt.example.com/reset-password?token=abc");
    expect(email.text).toContain("works for 1 hour");
    expect(email.text).not.toContain("/dashboard/settings");
  });

  it("confirms password changes", () => {
    expect(passwordChangedEmail({ recipientName: "Sam" }, env).subject).toBe("Your password was changed");
  });

  it("has a generic fallback", () => {
    const email = notificationEmail(
      { recipientName: "Sam", title: "Payouts are set up", body: "Money goes to Stripe.", link: "/dashboard/payouts" },
      env,
    );
    expect(email.subject).toBe("Payouts are set up");
    expect(email.text).toContain("View details: https://pt.example.com/dashboard/payouts");
  });
});
