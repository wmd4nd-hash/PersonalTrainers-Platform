import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: {} }));

const { checkUpload, inlineDisposition, readUpload, safeFilename, sniffContentType, UPLOAD_RULES } = await import(
  "./storage"
);

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);
const padded = (head: Uint8Array, size = 64) => {
  const out = new Uint8Array(size);
  out.set(head);
  return out;
};

const jpeg = padded(bytes(0xff, 0xd8, 0xff, 0xe0));
const png = padded(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const webp = padded(ascii("RIFF\x24\x00\x00\x00WEBPVP8 "));
const pdf = padded(ascii("%PDF-1.7\n"));

describe("sniffContentType", () => {
  it("recognises supported formats by their magic bytes", () => {
    expect(sniffContentType(jpeg)).toBe("image/jpeg");
    expect(sniffContentType(png)).toBe("image/png");
    expect(sniffContentType(webp)).toBe("image/webp");
    expect(sniffContentType(pdf)).toBe("application/pdf");
  });

  it("rejects anything else", () => {
    expect(sniffContentType(ascii("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffContentType(ascii("RIFF\x24\x00\x00\x00WAVEfmt "))).toBeNull();
    expect(sniffContentType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffContentType(new Uint8Array())).toBeNull();
  });
});

describe("checkUpload", () => {
  it("accepts images for photos and PDFs or images for documents", () => {
    expect(checkUpload(webp, "avatar")).toEqual({ ok: true, contentType: "image/webp" });
    expect(checkUpload(pdf, "document")).toEqual({ ok: true, contentType: "application/pdf" });
    expect(checkUpload(png, "document")).toEqual({ ok: true, contentType: "image/png" });
  });

  it("rejects the wrong kind of file even when it is a supported format", () => {
    expect(checkUpload(pdf, "avatar").ok).toBe(false);
    expect(checkUpload(webp, "document").ok).toBe(false);
  });

  it("enforces the size limits", () => {
    const bigPhoto = padded(jpeg, UPLOAD_RULES.avatar.maxBytes + 1);
    expect(checkUpload(bigPhoto, "avatar")).toEqual({ ok: false, error: "That file is 2.0 MB. The limit is 2.0 MB." });
    expect(checkUpload(padded(pdf, UPLOAD_RULES.document.maxBytes), "document").ok).toBe(true);
    expect(checkUpload(padded(pdf, UPLOAD_RULES.document.maxBytes + 1), "document").ok).toBe(false);
    expect(checkUpload(new Uint8Array(), "document").ok).toBe(false);
  });
});

describe("readUpload", () => {
  it("uses the detected type, not the one the browser claims", async () => {
    const file = new File([png], "photo.jpg", { type: "image/jpeg" });
    const result = await readUpload(file, "avatar");
    expect(result.ok && result.file.contentType).toBe("image/png");
    expect(result.ok && result.file.filename).toBe("photo.png");
  });

  it("rejects a text file renamed to .pdf", async () => {
    const file = new File(["hello"], "certificate.pdf", { type: "application/pdf" });
    expect(await readUpload(file, "document")).toEqual({
      ok: false,
      error: "That file doesn't look like a PDF, JPEG or PNG file. Choose another one.",
    });
  });

  it("asks for a file when none was chosen", async () => {
    expect((await readUpload(null, "document")).ok).toBe(false);
    expect((await readUpload(new File([], ""), "document")).ok).toBe(false);
    expect((await readUpload("text", "document")).ok).toBe(false);
  });
});

describe("safeFilename", () => {
  it("strips paths and control characters and fixes the extension", () => {
    expect(safeFilename("C:\\fakepath\\My cert.PDF", "application/pdf")).toBe("My cert.pdf");
    expect(safeFilename('../"evil"\n.png', "image/png")).toBe("evil.png");
    expect(safeFilename("scan", "image/jpeg")).toBe("scan.jpg");
    expect(safeFilename("Dr. Lee certificate", "application/pdf")).toBe("Dr. Lee certificate.pdf");
    expect(safeFilename("policy.jpg", "application/pdf")).toBe("policy.pdf");
    expect(safeFilename("", "application/pdf")).toBe("upload.pdf");
    expect(safeFilename(".pdf", "application/pdf")).toBe("upload.pdf");
  });
});

describe("inlineDisposition", () => {
  it("includes an ASCII fallback and the UTF-8 name", () => {
    expect(inlineDisposition("Seguro Ramírez.pdf")).toBe(
      `inline; filename="Seguro Ram_rez.pdf"; filename*=UTF-8''Seguro%20Ram%C3%ADrez.pdf`,
    );
  });
});
