import { describe, expect, it } from "vitest";

import { matchWidthPreset, snapWidth } from "../mediaWidth";

describe("snapWidth", () => {
  it("离预设较远时保持原值", () => {
    expect(snapWidth(620, 1000)).toEqual({ width: 620, preset: null });
  });

  it("可用宽度未知时不吸附", () => {
    expect(snapWidth(500, 0)).toEqual({ width: 500, preset: null });
  });
});

describe("matchWidthPreset", () => {
  it("2px 以内视为命中预设", () => {
    expect(matchWidthPreset(751, 1000)).toBe(0.75);
    expect(matchWidthPreset(746, 1000)).toBeNull();
    expect(matchWidthPreset(undefined, 1000)).toBeNull();
  });
});
