import { describe, it, expect } from "vitest";
import {
  inferMimeType,
  isSupportedOcrMime,
  isPdfMime,
  isImageMime,
  extractZaiErrorMessage,
  isRetryableHttpStatus,
  replaceExtension,
  friendlyPdfLoadError,
} from "@/lib/ocr";

describe("inferMimeType", () => {
  it("prefers a reported type when it is meaningful", () => {
    expect(inferMimeType("scan.png", "image/png")).toBe("image/png");
  });

  it("normalizes image/jpg to image/jpeg", () => {
    expect(inferMimeType("photo.jpg", "image/jpg")).toBe("image/jpeg");
  });

  it("falls back to the extension when the type is generic", () => {
    expect(inferMimeType("doc.pdf", "application/octet-stream")).toBe(
      "application/pdf"
    );
    expect(inferMimeType("image.webp", "")).toBe("image/webp");
  });

  it("returns octet-stream for unknown extensions", () => {
    expect(inferMimeType("mystery.xyz")).toBe("application/octet-stream");
  });
});

describe("isSupportedOcrMime", () => {
  it("accepts supported image and pdf types, including webp", () => {
    for (const mime of [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
    ]) {
      expect(isSupportedOcrMime(mime)).toBe(true);
    }
  });

  it("rejects unsupported types", () => {
    expect(isSupportedOcrMime("image/gif")).toBe(false);
    expect(isSupportedOcrMime("application/zip")).toBe(false);
  });
});

describe("mime predicates", () => {
  it("identifies pdf and image mime types", () => {
    expect(isPdfMime("application/pdf")).toBe(true);
    expect(isPdfMime("image/png")).toBe(false);
    expect(isImageMime("image/webp")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
  });
});

describe("extractZaiErrorMessage", () => {
  it("reads a nested error message with code", () => {
    expect(
      extractZaiErrorMessage({ error: { message: "Bad file", code: 1210 } })
    ).toBe("Bad file (code 1210)");
  });

  it("reads a nested error message without code", () => {
    expect(extractZaiErrorMessage({ error: { message: "Bad file" } })).toBe(
      "Bad file"
    );
  });

  it("falls back to a top-level message", () => {
    expect(extractZaiErrorMessage({ message: "Top level" })).toBe("Top level");
  });

  it("returns undefined for unusable payloads", () => {
    expect(extractZaiErrorMessage(null)).toBeUndefined();
    expect(extractZaiErrorMessage("oops")).toBeUndefined();
    expect(extractZaiErrorMessage({ error: { message: "   " } })).toBeUndefined();
  });
});

describe("isRetryableHttpStatus", () => {
  it("retries on 429 and 5xx", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetryableHttpStatus(status)).toBe(true);
    }
  });

  it("does not retry on 4xx (except 429) or 200", () => {
    for (const status of [200, 400, 401, 403, 404, 413]) {
      expect(isRetryableHttpStatus(status)).toBe(false);
    }
  });
});

describe("replaceExtension", () => {
  it("swaps the trailing extension", () => {
    expect(replaceExtension("report.png", "jpg")).toBe("report.jpg");
    expect(replaceExtension("a.b.c.pdf", "part-1.pdf")).toBe("a.b.c.part-1.pdf");
  });

  it("appends when there is no extension", () => {
    expect(replaceExtension("noext", "jpg")).toBe("noext.jpg");
  });
});

describe("friendlyPdfLoadError", () => {
  it("explains password-protected pdfs", () => {
    expect(friendlyPdfLoadError(new Error("PDF is encrypted"))).toMatch(
      /password-protected/i
    );
  });

  it("explains corrupt pdfs", () => {
    expect(friendlyPdfLoadError(new Error("invalid object stream"))).toMatch(
      /corrupted or not a valid PDF/i
    );
  });

  it("passes through other messages", () => {
    expect(friendlyPdfLoadError(new Error("disk full"))).toBe(
      "Could not read this PDF: disk full"
    );
  });
});
