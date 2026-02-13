import { describe, expect, it } from "vitest";
import { CARD_CATEGORY_OPTIONS, isKnownCardCategory } from "../cardCategory";

describe("cardCategory", () => {
  it("应提供四种固定卡片类型", () => {
    expect(CARD_CATEGORY_OPTIONS.map((item) => item.value)).toEqual([
      "temporary",
      "permanent",
      "theme",
      "literature",
    ]);
  });

  it("应正确识别合法与非法类型", () => {
    expect(isKnownCardCategory("temporary")).toBe(true);
    expect(isKnownCardCategory("permanent")).toBe(true);
    expect(isKnownCardCategory("theme")).toBe(true);
    expect(isKnownCardCategory("literature")).toBe(true);
    expect(isKnownCardCategory("TEMPORARY")).toBe(false);
    expect(isKnownCardCategory("unknown")).toBe(false);
  });
});
