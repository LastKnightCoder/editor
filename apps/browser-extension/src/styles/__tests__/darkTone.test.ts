import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listThemes } from "@tau/themes";
import { darkToneTokens, mixSrgb, renderDarkToneCss } from "../darkTone";

const contrast = (fg: string, bg: string) => {
  const luminance = (hex: string) => {
    const value = parseInt(hex.slice(1), 16);
    const [r, g, b] = [16, 8, 0].map(shift => {
      const c = ((value >> shift) & 255) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("插件深色调亮", () => {
  it("与 color-mix(in srgb) 同口径", () => {
    expect(mixSrgb("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixSrgb("#221d16", "#ece2d0", 0)).toBe("#221d16");
  });

  it("dark-tone.css 与主题定义一致（主题改了就按这里的期望重写该文件）", () => {
    const file = readFileSync(resolve(import.meta.dirname, "../dark-tone.css"), "utf8");
    expect(file).toBe(renderDarkToneCss());
  });

  it.each(listThemes().map(theme => [theme.name, theme] as const))(
    "%s：比原深色更亮，文字对卡片仍满足 AA",
    (_name, theme) => {
      const base = theme.dark.tokens as Record<string, string>;
      const toned = darkToneTokens(theme);
      expect(contrast(toned["bg-surface"]!, "#000000")).toBeGreaterThan(
        contrast(base["bg-surface"]!, "#000000")
      );
      expect(contrast(base["ink-1"]!, toned["bg-surface"]!)).toBeGreaterThanOrEqual(7);
      expect(contrast(toned["ink-2"]!, toned["bg-surface"]!)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
