import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectCssVars, missingTokenWords, resolveCssVars } from "@tau/themes/testing";

/**
 * 侧边栏明暗两套都必须桥接出完整的 --tau-*（编辑器等公共包只认这套契约）。
 * 解析 style.css + tau-tokens.css 的变量声明，按「:root → .dark」叠加后逐词检查。
 */
const read = (file: string) => readFileSync(resolve(import.meta.dirname, "..", file), "utf8");
const blocks = collectCssVars(read("style.css") + read("tau-tokens.css"));

describe("浏览器扩展侧边栏 --tau-* 桥接", () => {
  it("浅色全部 token 有值", () => {
    expect(missingTokenWords(resolveCssVars(blocks, [":root"]))).toEqual([]);
  });

  it("深色全部 token 有值，且取深色配色", () => {
    const light = resolveCssVars(blocks, [":root"]);
    const dark = resolveCssVars(blocks, [":root", ".dark"]);
    expect(missingTokenWords(dark)).toEqual([]);
    expect(dark("--tau-bg-page")).not.toBe(light("--tau-bg-page"));
  });
});

/** WCAG 相对亮度对比度（仅支持 #rrggbb） */
const contrastRatio = (fg: string, bg: string) => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("反白墨对比度", () => {
  // tooltip 是 bg-ink-1 + text-ink-inverse：深色下二者都偏亮就看不清
  it.each([
    ["浅色", [":root"]],
    ["深色", [":root", ".dark"]],
  ])("%s下 ink-inverse 压在 ink-1 上可读", (_label, selectors) => {
    const resolve = resolveCssVars(blocks, selectors);
    expect(
      contrastRatio(resolve("--tau-ink-inverse")!, resolve("--tau-ink-1")!)
    ).toBeGreaterThanOrEqual(4.5);
  });
});
