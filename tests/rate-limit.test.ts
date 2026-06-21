import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  getClientIdentifier,
  resetRateLimiter,
} from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("allows requests up to the limit then blocks", () => {
    const opts = { windowMs: 60_000, max: 3, now: 1_000 };

    expect(checkRateLimit("ip-a", opts).allowed).toBe(true);
    expect(checkRateLimit("ip-a", opts).allowed).toBe(true);
    const third = checkRateLimit("ip-a", opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = checkRateLimit("ip-a", opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("tracks identifiers independently", () => {
    const opts = { windowMs: 60_000, max: 1, now: 1_000 };
    expect(checkRateLimit("ip-a", opts).allowed).toBe(true);
    expect(checkRateLimit("ip-b", opts).allowed).toBe(true);
    expect(checkRateLimit("ip-a", opts).allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    expect(
      checkRateLimit("ip-a", { windowMs: 1_000, max: 1, now: 0 }).allowed
    ).toBe(true);
    expect(
      checkRateLimit("ip-a", { windowMs: 1_000, max: 1, now: 500 }).allowed
    ).toBe(false);
    // Window has rolled over.
    expect(
      checkRateLimit("ip-a", { windowMs: 1_000, max: 1, now: 1_500 }).allowed
    ).toBe(true);
  });

  it("reports a sane retry-after", () => {
    const result = checkRateLimit("ip-a", {
      windowMs: 30_000,
      max: 1,
      now: 0,
    });
    expect(result.retryAfterSeconds).toBe(30);
  });
});

describe("getClientIdentifier", () => {
  it("uses the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(getClientIdentifier(headers)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip then unknown", () => {
    expect(getClientIdentifier(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe(
      "3.3.3.3"
    );
    expect(getClientIdentifier(new Headers())).toBe("unknown");
  });
});
