import { describe, expect, it } from "vitest";
import { sparklinePoints } from "./sparkline";

describe("sparklinePoints", () => {
  it("spreads values across the width with the highest at the top", () => {
    expect(sparklinePoints([10, 20, 15], 100, 40, 0)).toEqual([
      [0, 40],
      [50, 0],
      [100, 20],
    ]);
  });

  it("keeps a padding inside the box", () => {
    const points = sparklinePoints([1, 2], 120, 32, 3);
    expect(points).toEqual([
      [3, 29],
      [117, 3],
    ]);
  });

  it("centres a flat or single-value series", () => {
    expect(sparklinePoints([5, 5], 100, 40, 0)).toEqual([
      [0, 20],
      [100, 20],
    ]);
    expect(sparklinePoints([5], 100, 40)).toEqual([[50, 20]]);
    expect(sparklinePoints([], 100, 40)).toEqual([]);
  });
});
