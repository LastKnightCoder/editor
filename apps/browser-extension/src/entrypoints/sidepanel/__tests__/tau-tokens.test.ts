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
