import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectCssVars, missingTokenWords, resolveCssVars } from "@tau/themes/testing";

/**
 * blog 明暗两套都必须桥接出完整的 --tau-*（编辑器等公共包只认这套契约）。
 * 层叠与页面一致：global.css 的 :root / [data-theme] → legacy-palette.css 的 html[data-theme]
 * （更具体，覆盖同名变量）→ tau-tokens.css 桥接。
 */
const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");
const blocks = collectCssVars(
  read("global.css") + read("legacy-palette.css") + read("tau-tokens.css")
);

const scopes = (mode: "light" | "dark") => [
  ":root",
  `[data-theme="${mode}"]`,
  `html[data-theme="${mode}"]`,
];

describe("blog --tau-* 桥接", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`${mode} 全部 token 有值`, () => {
      expect(missingTokenWords(resolveCssVars(blocks, scopes(mode)))).toEqual([]);
    });
  }

  it("桥接跟随页面实际配色：页面底色取旧配色层覆盖后的值", () => {
    const light = resolveCssVars(blocks, scopes("light"));
    const dark = resolveCssVars(blocks, scopes("dark"));
    expect(light("--tau-bg-page")).toBe("#f3f4f6");
    expect(dark("--tau-bg-page")).toBe("#010409");
  });
});
