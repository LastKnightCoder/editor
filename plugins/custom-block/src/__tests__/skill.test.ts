import { act } from "react";
import "vitest-canvas-mock";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { compileAndExecuteCustomBlock } from "../utils/renderTemplate";
import customBlockSkill from "../../SKILL.md?raw";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 按「### 标题」切出 skill 里的每个 custom-block 示例；首个示例在「输出格式」节，标题为空 */
function extractExamples(markdown: string) {
  const examples: Array<{ title: string; code: string }> = [];
  let title = "";
  const fence = /^### (.+)$|```custom-block\n([\s\S]*?)\n```/gm;
  for (const match of markdown.matchAll(fence)) {
    if (match[1] !== undefined) title = match[1];
    else examples.push({ title: title || "输出格式", code: match[2] });
  }
  return examples;
}

const examples = extractExamples(customBlockSkill);

const LEGACY_PATTERNS: Array<[string, RegExp]> = [
  ["import/export", /^\s*(import|export)\s/m],
  ["antd", /\bantd\b/],
  ["hooks.*", /\bhooks\./],
  ["components.*", /\bcomponents\./],
  ["dark: 变体", /\bdark:/],
  ["isDark 选色", /isDark\s*\?/],
  ["Tailwind 调色板", /\b(?:bg|text|border|from|to|via)-[a-z]+-\d{2,3}\b/],
  ["拼接类名", /\b(?:bg|text|border)-[\w-]*\$\{/],
  ["深色舞台 bg-sunken", /\bbg-sunken\b/],
];
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

describe("custom-block skill 示例", () => {
  let cleanup: (() => void) | undefined;

  beforeAll(() => {
    if (typeof globalThis.ResizeObserver !== "function") {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
  });

  afterEach(async () => {
    await act(async () => cleanup?.());
    cleanup = undefined;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("覆盖输出格式与 5 类标准示例", () => {
    expect(examples.map(example => example.title)).toEqual([
      "输出格式",
      "控件驱动布局（并列对象用 tag 色）",
      "CSS 特性演示（`@scope` 隔离样式）",
      "Canvas（`useTokens` 取色，主题切换自动重绘）",
      "演示色（颜色就是演示内容）",
      "悬停说明与点开详情（`Tooltip` / `Popover` / `icons`）",
    ]);
  });

  it.each(examples)("$title：不含旧写法，字面颜色只出现在演示色示例", ({ title, code }) => {
    for (const [name, pattern] of LEGACY_PATTERNS) {
      expect(pattern.test(code), `${title} 含 ${name}`).toBe(false);
    }
    expect(LITERAL_COLOR.test(code)).toBe(title.startsWith("演示色"));
    expect(code).toMatch(/\bconst Component\b/);
  });

  it.each(examples)("$title：在 v2 运行时中渲染无错误", { timeout: 20000 }, async ({ code }) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      cleanup = await compileAndExecuteCustomBlock(
        code,
        { isDark: false, token: word => `var(--tau-${word})` },
        container
      );
    });

    expect(container.textContent).not.toContain("渲染错误");
    expect(container.childElementCount).toBeGreaterThan(0);
    // jsdom 的 CSS 解析器不支持 @scope（Chromium 支持），只放过这一类解析告警
    const realErrors = consoleError.mock.calls.filter(
      ([error]) => !String(error).includes("Could not parse CSS stylesheet")
    );
    expect(realErrors).toEqual([]);
  });
});
