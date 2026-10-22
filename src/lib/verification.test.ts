import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  expireLapsedVerifications,
  isDocumentExpired,
  nextVerificationState,
  requirementState,
  verificationStatusFor,
  type DocumentForStatus,
} from "./verification";

const now = new Date("2026-10-22T15:00:00Z");
const day = (d: string) => new Date(`${d}T00:00:00Z`);

function doc(overrides: Partial<DocumentForStatus>): DocumentForStatus {
  return { kind: "CERTIFICATION", status: "PENDING", expiresOn: null, reviewedAt: null, ...overrides };
}

const approvedCert = doc({ kind: "CERTIFICATION", status: "APPROVED", reviewedAt: day("2026-10-01") });
const approvedInsurance = doc({ kind: "INSURANCE", status: "APPROVED", reviewedAt: day("2026-10-02") });

describe("isDocumentExpired", () => {
  it("treats documents without an expiry date as valid", () => {
    expect(isDocumentExpired(null, now)).toBe(false);
  });
  it("keeps a document valid through its expiry day", () => {
    expect(isDocumentExpired(day("2026-10-22"), now)).toBe(false);
    expect(isDocumentExpired(day("2026-10-21"), now)).toBe(true);
  });
});

describe("verificationStatusFor", () => {
  it("is UNVERIFIED with no documents", () => {
    expect(verificationStatusFor([], now)).toBe("UNVERIFIED");
  });

  it("is VERIFIED with an approved certification and insurance", () => {
    expect(verificationStatusFor([approvedCert, approvedInsurance], now)).toBe("VERIFIED");
  });

  it("needs both kinds", () => {
    expect(verificationStatusFor([approvedCert], now)).toBe("UNVERIFIED");
    expect(verificationStatusFor([approvedInsurance, doc({ kind: "IDENTITY", status: "APPROVED" })], now)).toBe(
      "UNVERIFIED",
    );
  });

  it("ignores expired approvals", () => {
    const expired = { ...approvedInsurance, expiresOn: day("2026-10-01") };
    expect(verificationStatusFor([approvedCert, expired], now)).toBe("UNVERIFIED");
    const stillValid = { ...approvedInsurance, expiresOn: day("2027-01-01") };
    expect(verificationStatusFor([approvedCert, stillValid], now)).toBe("VERIFIED");
  });

  it("stays VERIFIED while a new document waits for review", () => {
    expect(verificationStatusFor([approvedCert, approvedInsurance, doc({ kind: "OTHER" })], now)).toBe("VERIFIED");
  });

  it("is PENDING while anything waits for review", () => {
    expect(verificationStatusFor([doc({})], now)).toBe("PENDING");
    const rejected = doc({ kind: "INSURANCE", status: "REJECTED", reviewedAt: day("2026-10-20") });
    expect(verificationStatusFor([approvedCert, rejected, doc({ kind: "INSURANCE" })], now)).toBe("PENDING");
  });

  it("is REJECTED when the latest decision was a rejection", () => {
    const rejected = doc({ kind: "INSURANCE", status: "REJECTED", reviewedAt: day("2026-10-20") });
    expect(verificationStatusFor([approvedCert, rejected], now)).toBe("REJECTED");
  });

  it("is UNVERIFIED when a later approval follows a rejection", () => {
    const rejected = doc({ kind: "INSURANCE", status: "REJECTED", reviewedAt: day("2026-09-01") });
    expect(verificationStatusFor([rejected, approvedCert], now)).toBe("UNVERIFIED");
  });
});

describe("nextVerificationState", () => {
  const verifiedDocs = [approvedCert, approvedInsurance];

  it("sets verifiedAt when a trainer becomes verified", () => {
    expect(nextVerificationState({ status: "PENDING", verifiedAt: null }, verifiedDocs, now)).toEqual({
      status: "VERIFIED",
      verifiedAt: now,
    });
  });

  it("keeps the original verifiedAt while still verified", () => {
    const since = day("2026-01-05");
    expect(nextVerificationState({ status: "VERIFIED", verifiedAt: since }, verifiedDocs, now)).toEqual({
      status: "VERIFIED",
      verifiedAt: since,
    });
  });

  it("clears verifiedAt when verification is lost", () => {
    expect(
      nextVerificationState({ status: "VERIFIED", verifiedAt: day("2026-01-05") }, [approvedCert], now),
    ).toEqual({ status: "UNVERIFIED", verifiedAt: null });
  });
});

describe("requirementState", () => {
  it("reports each required kind for the trainer checklist", () => {
    const expiredInsurance = { ...approvedInsurance, expiresOn: day("2025-01-01") };
    expect(requirementState([approvedCert], "CERTIFICATION", now)).toBe("approved");
    expect(requirementState([doc({ kind: "INSURANCE" })], "INSURANCE", now)).toBe("pending");
    expect(requirementState([expiredInsurance], "INSURANCE", now)).toBe("expired");
    expect(requirementState([doc({ kind: "INSURANCE", status: "REJECTED" })], "INSURANCE", now)).toBe("missing");
  });
});

describe("expireLapsedVerifications", () => {
  it("takes the badge from trainers whose approved documents have lapsed", async () => {
    const profiles: Record<string, { verificationStatus: string; verifiedAt: Date | null }> = {
      lapsed: { verificationStatus: "VERIFIED", verifiedAt: day("2026-01-05") },
      renewed: { verificationStatus: "VERIFIED", verifiedAt: day("2026-01-05") },
    };
    const docs: Record<string, DocumentForStatus[]> = {
      lapsed: [approvedCert, { ...approvedInsurance, expiresOn: day("2026-10-01") }],
      // An old policy expired, but a renewed one is approved: still verified.
      renewed: [
        approvedCert,
        { ...approvedInsurance, expiresOn: day("2026-10-01") },
        { ...approvedInsurance, expiresOn: day("2027-10-01") },
      ],
    };
    const update = vi.fn(async ({ where, data }: { where: { id: string }; data: (typeof profiles)[string] }) => {
      profiles[where.id] = data;
    });
    const client = {
      $queryRaw: async () => [],
      $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
      trainerProfile: {
        findMany: async () => Object.keys(docs).map((id) => ({ id })),
        findUnique: async ({ where }: { where: { id: string } }) => profiles[where.id] ?? null,
        update,
      },
      verificationDocument: {
        findMany: async ({ where }: { where: { trainerId: string } }) => docs[where.trainerId] ?? [],
      },
    };

    expect(await expireLapsedVerifications(client as unknown as PrismaClient, now)).toBe(1);
    expect(profiles.lapsed).toEqual({ verificationStatus: "UNVERIFIED", verifiedAt: null });
    expect(profiles.renewed!.verificationStatus).toBe("VERIFIED");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
