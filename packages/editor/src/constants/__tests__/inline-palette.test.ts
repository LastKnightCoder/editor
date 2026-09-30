// 色板的具体色值（TS，写入字色 mark 与导出用）与 editor.css 的 [data-mode] 数据块必须一致。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportHighlightColors,
  findInlineColorByInk,
  inlineHighlight,
  inlineInk,
  inlinePaletteCssVars,
} from "../inline-palette";

const css = readFileSync(resolve(__dirname, "../../theme/editor.css"), "utf8");

/** 取出选择器紧跟的那一个声明块里的自定义属性 */
const readBlock = (selector: string): Record<string, string> => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `editor.css 缺少 ${selector} 数据块`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/(--ed-[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
  );
};

describe("inline palette", () => {
  it.each([
    ["light", '[data-mode="light"]'],
    ["dark", '[data-mode="dark"]'],
  ] as const)("%s 数据块与 TS 表一致", (mode, selector) => {
    expect(readBlock(selector)).toEqual(inlinePaletteCssVars(mode));
  });

  it("渲染取 CSS 变量，未知色相为空", () => {
    expect(inlineInk("red")).toBe("var(--ed-palette-red)");
    expect(inlineInk("nope")).toBeUndefined();
    expect(inlineHighlight("blue")?.background).toContain("var(--ed-palette-blue)");
    expect(inlineHighlight(true)).toBeUndefined();
  });

  it("导出取浅色档具体色值", () => {
    expect(exportHighlightColors("red")).toEqual({
      background: "rgba(227, 58, 50, 0.16)",
      line: "rgba(227, 58, 50, 0.65)",
    });
  });

  it("字色按任一明暗档反查色相", () => {
    expect(findInlineColorByInk("#FA7873")?.id).toBe("red");
    expect(findInlineColorByInk("#123456")).toBeUndefined();
  });
});
