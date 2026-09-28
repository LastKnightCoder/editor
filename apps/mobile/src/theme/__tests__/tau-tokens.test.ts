import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectCssVars, missingTokenWords, resolveCssVars } from "@tau/themes/testing";
import { THEME_OPTIONS } from "../themeStore";

/**
 * 移动端每套主题都必须桥接出完整的 --tau-*（编辑器等公共包只认这套契约）。
 * 解析 styles.css + tau-tokens.css 的变量声明，按「:root → 主题块」叠加后逐词检查。
 */
const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");
const blocks = collectCssVars(read("../../styles.css") + read("../tau-tokens.css"));

describe("移动端 --tau-* 桥接", () => {
  for (const theme of THEME_OPTIONS) {
    it(`${theme.label}（${theme.id}）全部 token 有值`, () => {
      const value = resolveCssVars(blocks, [":root", `[data-theme="${theme.id}"]`]);
      expect(missingTokenWords(value)).toEqual([]);
    });
  }

  it("桥接取主题自身的值：玄夜的 accent 是深色主题的品牌色", () => {
    const midnight = resolveCssVars(blocks, [":root", '[data-theme="midnight"]']);
    const apricot = resolveCssVars(blocks, [":root", '[data-theme="apricot"]']);
    expect(midnight("--tau-accent")).toBe(midnight("--brand"));
    expect(midnight("--tau-bg-page")).not.toBe(apricot("--tau-bg-page"));
  });
});
