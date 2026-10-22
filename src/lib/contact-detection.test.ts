import { describe, expect, it } from "vitest";
import { containsContactDetails, detectContactDetails, type ContactReason } from "./contact-detection";

function reasons(text: string) {
  return detectContactDetails(text).reasons;
}

describe("detectContactDetails", () => {
  describe("email addresses", () => {
    it.each([
      "sam.client+pt@gmail.com",
      "Reach me: SAM@GMAIL.COM",
      "my work one is sam@studio.co.uk",
      "sam at gmail dot com",
      "sam [at] gmail [dot] com",
      "sam(at)gmail(dot)com",
      "sam (at) outlook.com",
      "sam{at}proton{dot}me",
    ])("flags %j", (text) => {
      expect(reasons(text)).toContain("email");
    });

    it("doesn't also report the email's domain as a link", () => {
      expect(reasons("sam@samfit.com")).toEqual(["email"]);
    });
  });

  describe("phone numbers", () => {
    it.each([
      "+44 7700 900123",
      "+447700900123",
      "+1 (212) 555-0199",
      "07700 900 123",
      "07700900123",
      "Call 07700 900123.",
      "212-555-0199",
      "(212) 555 0199",
      "212.555.0199",
      "0 7 7 0 0 9 0 0 1 2 3",
      "0-7-7-0-0-9-0-0-1-2-3",
      "+49 151 23456789",
      "0049 151 2345 6789",
      "0151/23456789",
      "06 12 34 56 78",
      "06.12.34.56.78",
      "+33 6 12 34 56 78",
      "912 345 678",
      "+351 912 345 678",
      "050 123 4567",
      "+971 50 123 4567",
      "090-1234-5678",
      "+81 90 1234 5678",
      "+65 8123 4567",
      "zero seven seven zero zero nine zero zero one two three",
      "Seven, seven, zero, zero, nine, zero, zero",
      "０７７００ ９００１２３",
      "07700​900123",
    ])("flags %j", (text) => {
      expect(reasons(text)).toContain("phone");
    });
  });

  describe("links", () => {
    it.each([
      "https://samfit.com/book",
      "http://localhost:3000",
      "www.samfit.com",
      "Book at samfit.co.uk/sessions",
      "wa.me/447700900123",
      "linktr.ee/samfit",
      "bit.ly/3abcXYZ",
      "calendly.com/sam/60min",
      "samfit dot com",
      "samfit (dot) co (dot) uk",
    ])("flags %j", (text) => {
      expect(reasons(text)).toContain("url");
    });

    it("doesn't read a link's digits as a phone number", () => {
      expect(reasons("https://wa.me/447700900123")).toEqual(["url"]);
    });
  });

  describe("off-platform contact and payment cues", () => {
    it.each([
      "Add me on WhatsApp",
      "whats app me",
      "I'm on Telegram",
      "Find me on telegram, t.me/samfit",
      "We could just Skype",
      "Can I Venmo you?",
      "paypal.me/samfit",
      "Do you take PayPal?",
      "I'll send it on Cash App",
      "Zelle works for me",
      "Can I pay by Revolut?",
      "Just text me when you're outside",
      "txt me",
      "Give me a call tonight",
      "Call me on my mobile",
      "Email me the plan",
      "DM me",
      "Message me on signal",
      "Follow me @sam.lifts",
      "I'm @samlifts_ on there",
      "my insta is samlifts",
      "ig: samlifts",
      "Add me on Instagram",
      "What's your number?",
      "Send me your email",
      "My number is below",
      "my phone number is on my profile",
      "Let's pay cash and skip the fees",
      "I can pay you directly",
      "Cash in hand is fine",
      "Can we sort it outside the app?",
      "We can do it off platform",
      "Book without the platform fee next time",
      "Bank transfer is easier",
      "My sort code is on the invoice",
      "IBAN GB29 NWBK 6016 1331 9268 19",
      "Reach me directly",
      "I can pay you in cash",
    ])("flags %j", (text) => {
      expect(reasons(text)).toContain("off_platform");
    });
  });

  describe("everyday training chat", () => {
    it.each([
      "Sounds good, see you then!",
      "Can we do 7:30 tomorrow?",
      "How about 7.30 or 8.30?",
      "Slots at 7.30 8.30 9.30 10.30 all work",
      "Meet at 10:30am at PureGym Camden",
      "Sessions are £65 each, or £300 for five",
      "It's $80.00 per hour",
      "That comes to €1.250 for the block",
      "It's USD 120 for the pack",
      "I squatted 100kg for 5 reps",
      "My bench is 82.5 kg",
      "I weigh 185 lbs",
      "Week 1: 60 kg, week 2: 65 kg",
      "Let's do 3 sets of 12",
      "3x10 at 60kg, rest 90 secs",
      "Ran 10km in 45:30",
      "Goal: lose 5kg in 12 weeks",
      "I walk 10000 steps a day",
      "My resting heart rate is 58 bpm",
      "That workout burned 1,250 calories",
      "See you on 22/10/2026 at 14:30",
      "2026-10-22 14:30 works for me",
      "Are you free 22.10.2026 or 29.10.2026?",
      "Booked for Oct 22, 2026",
      "I'll be there @ 7",
      "see you @gym",
      "Meet @5pm",
      "Meet @7.30am by the entrance",
      "Message me on here anytime",
      "You can reach me through the app",
      "I found you on the app",
      "Can I pay with the package I bought?",
      "Can I pay with Apple Pay?",
      "i.e. the deadlift, e.g. the squat",
      "I'm at work. Co-workers keep me late",
      "Can I call you Maya?",
      "The instant I got home I stretched",
      "The interactive warm-up was great",
      "My postcode is NW1 8NH",
      "Office is at 350 5th Ave, New York, NY 10118-0110",
      "One, two, three, go!",
      "Room 101, level 2",
      "Is the session online or in person?",
      "My number of sessions left is 3",
      "",
    ])("doesn't flag %j", (text) => {
      expect(detectContactDetails(text)).toEqual({ flagged: false, reasons: [] });
    });
  });

  it("lists every kind found, in a stable order", () => {
    const text = "Text me on +44 7700 900123 or email sam@gmail.com, or see samfit.com";
    const expected: ContactReason[] = ["email", "phone", "url", "off_platform"];
    expect(detectContactDetails(text)).toEqual({ flagged: true, reasons: expected });
  });

  it("gives the same answer when called repeatedly", () => {
    const text = "sam@gmail.com https://samfit.com";
    expect(reasons(text)).toEqual(reasons(text));
    expect(reasons(text)).toEqual(["email", "url"]);
  });
});

describe("containsContactDetails", () => {
  it("is true only for flagged messages", () => {
    expect(containsContactDetails("Can you text me on 07700 900123?")).toBe(true);
    expect(containsContactDetails("See you at 7:30 for 3 sets of 10 at 60kg")).toBe(false);
  });
});
