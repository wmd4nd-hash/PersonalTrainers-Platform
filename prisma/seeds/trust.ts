import type { DocumentKind, DocumentStatus } from "../../src/generated/prisma/client";
import { verificationStatusFor } from "../../src/lib/verification";
import type { SeedContext } from "./context";

const DAY_MS = 86_400_000;

/** A small, valid one-page PDF with a few lines of text. */
export function placeholderPdf(lines: string[]): Uint8Array<ArrayBuffer> {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 72 ${720 - i * 30} Td (${escape(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

type SeedDocument = {
  kind: DocumentKind;
  status: DocumentStatus;
  filename: string;
  title: string;
  issuer: string;
  uploadedDaysAgo: number;
  expiresInDays: number | null;
  reviewedDaysAgo?: number;
  note?: string;
};

const plans: Record<string, SeedDocument[]> = {
  "maya@example.com": [
    {
      kind: "CERTIFICATION",
      status: "APPROVED",
      filename: "NSCA CSCS certificate.pdf",
      title: "Certified Strength and Conditioning Specialist",
      issuer: "Demo Strength Association",
      uploadedDaysAgo: 40,
      expiresInDays: 600,
      reviewedDaysAgo: 38,
    },
    {
      kind: "INSURANCE",
      status: "APPROVED",
      filename: "Public liability insurance 2026.pdf",
      title: "Public liability insurance",
      issuer: "Demo Fitness Insurance Ltd",
      uploadedDaysAgo: 40,
      expiresInDays: 300,
      reviewedDaysAgo: 38,
    },
  ],
  "diego@example.com": [
    {
      kind: "CERTIFICATION",
      status: "APPROVED",
      filename: "Running coach certification.pdf",
      title: "Certified Running Coach, Level 2",
      issuer: "Demo Running Federation",
      uploadedDaysAgo: 25,
      expiresInDays: null,
      reviewedDaysAgo: 24,
    },
    {
      kind: "INSURANCE",
      status: "REJECTED",
      filename: "Insurance policy 2025.pdf",
      title: "Professional liability insurance",
      issuer: "Demo Insurance Co",
      uploadedDaysAgo: 25,
      expiresInDays: 10,
      reviewedDaysAgo: 24,
      note: "This policy runs out very soon. Please upload your renewed policy.",
    },
    {
      kind: "INSURANCE",
      status: "APPROVED",
      filename: "Insurance policy 2026-27.pdf",
      title: "Professional liability insurance",
      issuer: "Demo Insurance Co",
      uploadedDaysAgo: 20,
      expiresInDays: 380,
      reviewedDaysAgo: 19,
    },
  ],
  "sofia@example.com": [
    {
      kind: "CERTIFICATION",
      status: "PENDING",
      filename: "Pre and post-natal certificate.pdf",
      title: "Pre- and Post-Natal Exercise Specialist",
      issuer: "Demo Pilates Institute",
      uploadedDaysAgo: 2,
      expiresInDays: 730,
    },
  ],
};

/** Demo data for the trust feature. Must be safe to run more than once. */
export async function seedTrust(ctx: SeedContext) {
  const { db } = ctx;
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);
  const dayFromNow = (n: number) =>
    new Date(`${new Date(now.getTime() + n * DAY_MS).toISOString().slice(0, 10)}T00:00:00.000Z`);

  for (const [email, documents] of Object.entries(plans)) {
    const trainer = ctx.trainers[email];
    if (!trainer) continue;
    // Leave trainers who already have documents (an earlier seed, or real uploads) alone.
    if ((await db.verificationDocument.count({ where: { trainerId: trainer.trainerId } })) > 0) continue;

    const user = await db.user.findUniqueOrThrow({ where: { id: trainer.userId }, select: { name: true } });
    for (const doc of documents) {
      const data = placeholderPdf([
        doc.title,
        `Issued to: ${user.name}`,
        `Issued by: ${doc.issuer}`,
        doc.expiresInDays === null ? "Does not expire" : `Valid until: ${dayFromNow(doc.expiresInDays).toISOString().slice(0, 10)}`,
        "Placeholder document for the demo. Not a real certificate.",
      ]);
      await db.verificationDocument.create({
        data: {
          trainer: { connect: { id: trainer.trainerId } },
          kind: doc.kind,
          status: doc.status,
          expiresOn: doc.expiresInDays === null ? null : dayFromNow(doc.expiresInDays),
          reviewerNote: doc.note ?? "",
          createdAt: daysAgo(doc.uploadedDaysAgo),
          ...(doc.reviewedDaysAgo !== undefined && {
            reviewedAt: daysAgo(doc.reviewedDaysAgo),
            reviewedBy: { connect: { id: ctx.adminId } },
          }),
          file: {
            create: {
              ownerId: trainer.userId,
              filename: doc.filename,
              contentType: "application/pdf",
              size: data.length,
              data,
              createdAt: daysAgo(doc.uploadedDaysAgo),
            },
          },
        },
      });
    }

    // Same rules as the app; verified trainers count as verified from their last approval.
    const docs = await db.verificationDocument.findMany({
      where: { trainerId: trainer.trainerId },
      select: { kind: true, status: true, expiresOn: true, reviewedAt: true },
    });
    const lastReview = docs.reduce<Date | null>(
      (latest, d) => (d.reviewedAt && (!latest || d.reviewedAt > latest) ? d.reviewedAt : latest),
      null,
    );
    const status = verificationStatusFor(docs, now);
    await db.trainerProfile.update({
      where: { id: trainer.trainerId },
      data: { verificationStatus: status, verifiedAt: status === "VERIFIED" ? lastReview : null },
    });
  }
}
