import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

/**
 * Uploaded files, stored in the database for the POC. The real type of a file
 * is read from its first bytes; the browser's claimed type and the extension
 * are never trusted.
 */

const MB = 1024 * 1024;

export type UploadPurpose = "avatar" | "document";

export const UPLOAD_RULES = {
  avatar: {
    maxBytes: 2 * MB,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    description: "a JPEG, PNG or WebP image",
  },
  document: {
    maxBytes: 5 * MB,
    contentTypes: ["application/pdf", "image/jpeg", "image/png"],
    description: "a PDF, JPEG or PNG file",
  },
} as const satisfies Record<UploadPurpose, { maxBytes: number; contentTypes: string[]; description: string }>;

const EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

function hasBytes(bytes: Uint8Array, expected: readonly number[] | string, offset = 0) {
  const values = typeof expected === "string" ? [...expected].map((c) => c.charCodeAt(0)) : expected;
  return bytes.length >= offset + values.length && values.every((value, i) => bytes[offset + i] === value);
}

/** Detects a supported file type from its magic bytes, or null. */
export function sniffContentType(bytes: Uint8Array): string | null {
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (hasBytes(bytes, "RIFF") && hasBytes(bytes, "WEBP", 8)) return "image/webp";
  if (hasBytes(bytes, "%PDF-")) return "application/pdf";
  return null;
}

function formatSize(bytes: number) {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type UploadCheck = { ok: true; contentType: string } | { ok: false; error: string };

/** Checks an upload's size and real type against the rules for its purpose. */
export function checkUpload(bytes: Uint8Array, purpose: UploadPurpose): UploadCheck {
  const rules = UPLOAD_RULES[purpose];
  if (bytes.length === 0) return { ok: false, error: "That file is empty. Choose another one." };
  if (bytes.length > rules.maxBytes) {
    return {
      ok: false,
      error: `That file is ${formatSize(bytes.length)}. The limit is ${formatSize(rules.maxBytes)}.`,
    };
  }
  const contentType = sniffContentType(bytes);
  if (!contentType || !(rules.contentTypes as readonly string[]).includes(contentType)) {
    return { ok: false, error: `That file doesn't look like ${rules.description}. Choose another one.` };
  }
  return { ok: true, contentType };
}

/** A display-safe file name with an extension that matches the real type. */
export function safeFilename(name: string, contentType: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = [...base]
    .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f && !'"<>'.includes(c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const extensions = EXTENSIONS[contentType] ?? [];
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(cleaned);
  const ext = match?.[1]!.toLowerCase() ?? "";
  // Keep the extension when it matches the real type, replace a misleading one, else add one.
  const keepExt = extensions.includes(ext);
  const knownExt = Object.values(EXTENSIONS).some((list) => list.includes(ext));
  const stem = (knownExt ? cleaned.slice(0, match!.index) : cleaned)
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return `${stem || "upload"}.${keepExt ? ext : (extensions[0] ?? "bin")}`;
}

/** `Content-Disposition: inline` with an ASCII fallback and the UTF-8 name. */
export function inlineDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export type ValidUpload = {
  filename: string;
  contentType: string;
  size: number;
  data: Uint8Array<ArrayBuffer>;
};

export type ReadUploadResult = { ok: true; file: ValidUpload } | { ok: false; error: string };

/** Reads a file from a form field and checks it. Nothing is saved yet. */
export async function readUpload(value: FormDataEntryValue | null, purpose: UploadPurpose): Promise<ReadUploadResult> {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  // Reject oversized files before reading them into memory.
  if (value.size > UPLOAD_RULES[purpose].maxBytes) {
    return {
      ok: false,
      error: `That file is ${formatSize(value.size)}. The limit is ${formatSize(UPLOAD_RULES[purpose].maxBytes)}.`,
    };
  }
  const data = new Uint8Array(await value.arrayBuffer());
  const check = checkUpload(data, purpose);
  if (!check.ok) return check;
  return {
    ok: true,
    file: {
      filename: safeFilename(value.name, check.contentType),
      contentType: check.contentType,
      size: data.length,
      data,
    },
  };
}

type Tx = Prisma.TransactionClient;

/** Saves a checked upload for its owner and returns the new file id. */
export async function saveUpload(ownerId: string, file: ValidUpload, client: Tx = db): Promise<string> {
  const stored = await client.storedFile.create({
    data: { ownerId, ...file },
    select: { id: true },
  });
  return stored.id;
}

/** Deletes the owner's files that are no longer anyone's photo or a verification document. */
export async function deleteUnusedFiles(ownerId: string, client: Tx = db) {
  await client.storedFile.deleteMany({
    where: { ownerId, avatarOf: { is: null }, document: { is: null } },
  });
}
