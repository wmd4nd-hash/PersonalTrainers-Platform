import { describe, expect, it } from "vitest";
import { packageSchema } from "./packages";

const valid = { title: "  5-session pack ", description: "", sessionCount: "5", price: "292.50", validDays: "90" };

function errorsFor(input: Record<string, string>) {
  const result = packageSchema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("packageSchema", () => {
  it("parses a valid package, trimming text and converting the price to cents", () => {
    expect(packageSchema.parse(valid)).toEqual({
      title: "5-session pack",
      description: "",
      sessionCount: 5,
      price: 29250,
      validDays: 90,
    });
  });

  it("allows 2 to 50 sessions", () => {
    expect(errorsFor({ ...valid, sessionCount: "1" })).toHaveProperty("sessionCount");
    expect(errorsFor({ ...valid, sessionCount: "51" })).toHaveProperty("sessionCount");
    expect(errorsFor({ ...valid, sessionCount: "2.5" })).toHaveProperty("sessionCount");
    expect(errorsFor({ ...valid, sessionCount: "2" })).toEqual({});
    expect(errorsFor({ ...valid, sessionCount: "50", price: "2500" })).toEqual({});
  });

  it("allows 7 to 365 days of validity", () => {
    expect(errorsFor({ ...valid, validDays: "6" })).toHaveProperty("validDays");
    expect(errorsFor({ ...valid, validDays: "366" })).toHaveProperty("validDays");
    expect(errorsFor({ ...valid, validDays: "" })).toHaveProperty("validDays");
    expect(errorsFor({ ...valid, validDays: "7" })).toEqual({});
    expect(errorsFor({ ...valid, validDays: "365" })).toEqual({});
  });

  it("rejects malformed, tiny or huge prices", () => {
    expect(errorsFor({ ...valid, price: "abc" })).toHaveProperty("price");
    expect(errorsFor({ ...valid, price: "-10" })).toHaveProperty("price");
    expect(errorsFor({ ...valid, price: "10.999" })).toHaveProperty("price");
    expect(errorsFor({ ...valid, price: "4.99" })).toEqual({ price: "Charge at least 1.00 per session" });
    expect(errorsFor({ ...valid, price: "100001" })).toHaveProperty("price");
  });

  it("needs a name", () => {
    expect(errorsFor({ ...valid, title: " " })).toHaveProperty("title");
    expect(errorsFor({ ...valid, title: "x".repeat(81) })).toHaveProperty("title");
  });
});
