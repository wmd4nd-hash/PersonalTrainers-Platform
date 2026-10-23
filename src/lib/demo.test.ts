import { afterEach, describe, expect, it, vi } from "vitest";
import { isProtectedDemoAccount } from "./demo";

describe("isProtectedDemoAccount", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("protects seeded accounts only in demo mode", () => {
    expect(isProtectedDemoAccount("maya@example.com")).toBe(false);
    vi.stubEnv("DEMO_MODE", "true");
    expect(isProtectedDemoAccount("maya@example.com")).toBe(true);
    expect(isProtectedDemoAccount(" Admin@Example.com ")).toBe(true);
  });

  it("never protects accounts visitors create", () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(isProtectedDemoAccount("someone@example.com")).toBe(false);
    expect(isProtectedDemoAccount("me@gmail.com")).toBe(false);
  });
});
