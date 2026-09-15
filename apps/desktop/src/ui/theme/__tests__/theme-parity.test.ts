import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOKEN_WORDS, cssVarName } from "../tokenContract";
import { getTheme } from "../defineTheme";
import "../themes"; // 副作用注册（当前仅 cream）

// jsdom 环境下 import.meta.url 非 file:// 协议，按 vitest 运行根（apps/desktop）解析
const css = readFileSync(resolve(process.cwd(), "src/ui/theme/tokens.css"), "utf-8");

/** 提取 [data-theme="cream"] 数据块（到行首 } 为止） */
function themeBlock(): string {
  const start = css.indexOf('[data-theme="cream"]');
  expect(start, 'tokens.css 缺少 [data-theme="cream"] 数据块').toBeGreaterThan(-1);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

/**
 * 守护手工同步期（codegen 落地前）的漂移：tokens.css 数据块与 cream.theme.ts
 * 的 tokens() 产物必须逐值一致，否则首帧（CSS 级联）与声明式主题（协议/未来
 * 对比度门禁）各说各话。
 */
describe("theme 数据块与 defineTheme 产物一致", () => {
  it("每个 token 词汇在数据块中都有定义且取值一致", () => {
    const block = themeBlock();
    const tokens = getTheme("cream")!.tokens;
    const missing: string[] = [];
    const drifted: string[] = [];
    for (const word of ALL_TOKEN_WORDS) {
      const match = block.match(new RegExp(`${cssVarName(word)}\\s*:\\s*([^;]+);`));
      if (!match) {
        missing.push(word);
        continue;
      }
      if (match[1].trim() !== tokens[word])
        drifted.push(`${word}: css=${match[1].trim()} theme=${tokens[word]}`);
    }
    expect(missing, `数据块缺少 token：${missing.join(", ")}`).toEqual([]);
    expect(drifted, `token 取值漂移：\n${drifted.join("\n")}`).toEqual([]);
  });

  it("color-scheme 与主题 mode 一致", () => {
    const theme = getTheme("cream")!;
    expect(themeBlock()).toContain(`color-scheme: ${theme.mode}`);
  });
});
