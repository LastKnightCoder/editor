import { describe, expect, it } from "vitest";
import {
  TEXT_BOX,
  getTextBandColor,
  getTextBoxPadding,
  getTextSurface,
  resolveTextStyle,
} from "../text-style";

describe("resolveTextStyle", () => {
  it("新字段优先", () => {
    expect(
      resolveTextStyle({ type: "richtext", variant: "tinted", tone: "blue", background: "#fff" })
    ).toEqual({ variant: "tinted", tone: "blue" });
  });

  it("无任何外观字段时取默认（透明）", () => {
    expect(resolveTextStyle({ type: "richtext" })).toEqual({ variant: "none" });
  });

  it("旧版透明底 → 透明，白底 → 白卡", () => {
    expect(resolveTextStyle({ type: "richtext", background: "transparent" })).toEqual({
      variant: "none",
    });
    expect(resolveTextStyle({ type: "richtext", background: "#fff" })).toEqual({
      variant: "plain",
    });
  });

  it("旧版顶部色条 → 色带", () => {
    expect(resolveTextStyle({ type: "richtext", background: "#fff", topColor: "#F24A6E" })).toEqual(
      {
        variant: "band",
        tone: "red",
      }
    );
  });

  it("旧版纯色与渐变 → 柔色", () => {
    expect(resolveTextStyle({ type: "richtext", background: "#3F71FB" })).toEqual({
      variant: "tinted",
      tone: "blue",
    });
    expect(
      resolveTextStyle({
        type: "richtext",
        background: "linear-gradient(313.06deg, #EDDEFF 1.85%, #DDEAFF 101.12%)",
      })
    ).toEqual({ variant: "tinted", tone: "purple" });
  });

  it("认不出的旧色值按白卡", () => {
    expect(resolveTextStyle({ type: "richtext", background: "#000" })).toEqual({
      variant: "plain",
    });
    expect(resolveTextStyle({ type: "richtext", background: "#fff", topColor: "#5B5D70" })).toEqual(
      {
        variant: "plain",
      }
    );
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
