import { describe, expect, it } from "vitest";
import { ALL_TOKEN_WORDS, cssVarName } from "../index.ts";
import { collectCssVars, missingTokenWords, resolveCssVars } from "../testing.ts";

describe("@tau/themes/testing", () => {
  const css = `
    /* 注释里的 --x: 1; 不算 */
    :root, [data-theme="a"] { --base: #111; --alias: var(--base); }
    [data-theme="b"] { --base: #222; }
    :root { --tau-ink-1: var(--alias); --broken: var(--nope); --fb: var(--nope, red); }
  `;
  const blocks = collectCssVars(css);

  it("@import 语句不会并进后一条规则的选择器", () => {
    const withImport = collectCssVars('@import "./scale.css";\n[data-theme="p"] { --a: 1; }');
    expect(withImport.get('[data-theme="p"]')?.get("--a")).toBe("1");
  });

  it("多行书写的取值规整为单行", () => {
    const multiline = collectCssVars(
      ":root {\n  --shadow:\n    0 1px 2px red,\n    0 4px 8px blue;\n}"
    );
    expect(multiline.get(":root")?.get("--shadow")).toBe("0 1px 2px red, 0 4px 8px blue");
  });

  it("逗号选择器分别登记，注释被忽略", () => {
    expect(blocks.get(":root")?.get("--base")).toBe("#111");
    expect(blocks.get('[data-theme="a"]')?.get("--alias")).toBe("var(--base)");
    expect([...blocks.values()].some(vars => vars.has("--x"))).toBe(false);
  });

  it("按作用域叠加并解析 var() 链，fallback 生效，解析不到返回空串", () => {
    const readB = resolveCssVars(blocks, [":root", '[data-theme="b"]']);
    expect(readB("--tau-ink-1")).toBe("#222");
    expect(readB("--fb")).toBe("red");
    expect(readB("--broken")).toBe("");
  });

  it("missingTokenWords 报告缺失的词", () => {
    const read = resolveCssVars(blocks, [":root"]);
    const missing = missingTokenWords(read);
    expect(missing).not.toContain("ink-1");
    expect(missing).toHaveLength(ALL_TOKEN_WORDS.length - 1);
    expect(cssVarName("ink-1")).toBe("--tau-ink-1");
  });
});
