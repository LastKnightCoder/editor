import { describe, expect, it } from "vitest";
import { segmentToneAt } from "../waveformSegments";

describe("segmentToneAt", () => {
  const segments = [
    { start: 0, end: 0.4, tone: 1 as const },
    { start: 0.45, end: 1, tone: 2 as const },
  ];

  it("按比例落在哪段取哪段的色调，段间空隙为 null", () => {
    expect(segmentToneAt(segments, 0)).toBe(1);
    expect(segmentToneAt(segments, 0.39)).toBe(1);
    expect(segmentToneAt(segments, 0.42)).toBeNull();
    expect(segmentToneAt(segments, 0.45)).toBe(2);
    expect(segmentToneAt(segments, 0.99)).toBe(2);
  });
});
