import { describe, expect, it } from "vitest";
import {
  TEXT_BOX,
  getTextBandColor,
  getTextBoxPadding,
  getTextSurface,
  resolveTextStyle,
} from "../text-style";

describe("resolveTextStyle", () => {
  it("使用当前语义样式", () => {
    expect(resolveTextStyle({ type: "richtext", variant: "tinted", tone: "blue" })).toEqual({
      variant: "tinted",
      tone: "blue",
    });
  });

  it("无样式时取透明默认值", () => {
    expect(resolveTextStyle({ type: "richtext" })).toEqual({ variant: "none" });
  });

  it("不换算或改写旧色值字段", () => {
    const element = { type: "richtext", background: "#3F71FB", topColor: "#F24A6E" };
    const before = structuredClone(element);
    expect(resolveTextStyle(element)).toEqual({ variant: "none" });
    expect(element).toEqual(before);
  });
});

describe("外观派生", () => {
  it("色带样式顶部内边距让出色带高度", () => {
    const plain = getTextBoxPadding({ variant: "plain" });
    const band = getTextBoxPadding({ variant: "band", tone: "green" });
    expect(band.top - plain.top).toBe(TEXT_BOX.bandHeight);
    expect(band.left).toBe(plain.left);
  });

  it("透明无底板，柔色用 soft 底，色带有色", () => {
    expect(getTextSurface({ variant: "none" })).toBeNull();
    expect(getTextSurface({ variant: "tinted", tone: "red" })?.background).toBe(
      "var(--tau-tag-5-soft)"
    );
    expect(getTextBandColor({ variant: "band", tone: "yellow" })).toBe("var(--tau-tag-4)");
    expect(getTextBandColor({ variant: "plain" })).toBeNull();
  });
});
