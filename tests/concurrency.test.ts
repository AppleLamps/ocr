import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const delays = [40, 10, 30, 5];
    const results = await mapWithConcurrency(delays, 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }), 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("reports each completed index via onResult", async () => {
    const seen: number[] = [];
    await mapWithConcurrency(
      ["a", "b", "c"],
      2,
      async () => undefined,
      (index) => seen.push(index)
    );
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("propagates the first error and stops starting new work", async () => {
    let started = 0;
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started += 1;
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
    // With limit 1, items 1 and 2 start; the failure prevents 3-6 from starting.
    expect(started).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
