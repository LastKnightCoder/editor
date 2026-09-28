import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { THEME_MODES, getThemeRegistry } from "@tau/themes";
import { collectCssVars, missingTokenWords, resolveCssVars } from "@tau/themes/testing";

/**
 * 桌面直接使用 @tau/themes 的主题族：每个主题族 × 明暗都要在 tokens.css 里给出完整 --tau-*。
 * 与移动端 / blog / 浏览器扩展的桥接测试同一口径（docs/editor-refactor P2）。
 */
const require = createRequire(import.meta.url);
const blocks = collectCssVars(readFileSync(require.resolve("@tau/themes/tokens.css"), "utf8"));

describe("桌面 --tau-* 覆盖", () => {
  for (const theme of getThemeRegistry().values()) {
    for (const mode of THEME_MODES) {
      it(`${theme.name}（${theme.key}）· ${mode} 全部 token 有值`, () => {
        const read = resolveCssVars(blocks, [
          ":root",
          `[data-theme="${theme.key}"][data-mode="${mode}"]`,
        ]);
        expect(missingTokenWords(read)).toEqual([]);
      });
    }
  }
});
