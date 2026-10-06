import { describe, expect, it } from "vitest";
import { ZoomPlugin } from "@embedpdf/plugin-zoom";

describe("useMarginFit", () => {
  it("引擎仍有被包裹的 computeZoomForMode（升级后缺失则页边不再计入适宽）", () => {
    expect(
      typeof (ZoomPlugin.prototype as unknown as Record<string, unknown>).computeZoomForMode
    ).toBe("function");
  });
});
