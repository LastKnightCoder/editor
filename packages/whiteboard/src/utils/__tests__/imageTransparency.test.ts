import { describe, expect, it } from "vitest";

import { detectImageTransparency, isSvgUrl } from "../imageTransparency";

describe("isSvgUrl", () => {
  it("按扩展名（忽略查询串）与 data URL 识别 SVG", () => {
    expect(isSvgUrl("https://cdn.example.com/a/reading_1f2e.svg")).toBe(true);
    expect(isSvgUrl("https://cdn.example.com/a.SVG?v=1")).toBe(true);
    expect(isSvgUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E")).toBe(true);
    expect(isSvgUrl("https://cdn.example.com/a.png")).toBe(false);
    expect(isSvgUrl("https://cdn.example.com/svg/a.png")).toBe(false);
  });
});

describe("detectImageTransparency", () => {
  it("SVG 不加载直接视为透明", async () => {
    await expect(detectImageTransparency("https://cdn.example.com/a.svg")).resolves.toBe(true);
  });
});
