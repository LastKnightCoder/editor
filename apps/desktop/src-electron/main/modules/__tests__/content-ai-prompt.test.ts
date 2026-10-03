import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import {
  INPUT_MAX_CHARS,
  buildContentAiUserPrompt,
  parseContentAiOutput,
  titleDisplayLength,
} from "../content-ai-prompt";

const block = (type: string, text: string, extra: Record<string, unknown> = {}) =>
  ({ type, ...extra, children: [{ type: "formatted", text }] }) as unknown as Descendant;

describe("content-ai-prompt", () => {
  it("卡片只给正文；空正文返回 null", () => {
    expect(
      buildContentAiUserPrompt({ kind: "card", title: "", content: [block("paragraph", "观点")] })
    ).toBe("笔记类型：卡片\n\n正文：\n观点");
    expect(
      buildContentAiUserPrompt({ kind: "card", title: "", content: [block("paragraph", " ")] })
    ).toBeNull();
  });

  it("长文给标题、大纲与截断后的正文", () => {
    const content = [
      block("header", "一、背景", { level: 1 }),
      block("paragraph", "字".repeat(INPUT_MAX_CHARS + 100)),
      block("header", "细节", { level: 2 }),
    ];
    const prompt = buildContentAiUserPrompt({ kind: "article", title: "我的文章", content })!;
    expect(prompt).toContain("笔记类型：文章");
    expect(prompt).toContain("标题：我的文章");
    expect(prompt).toContain("大纲：\n- 一、背景\n  - 细节");
    expect(prompt).toContain(`正文（前 ${INPUT_MAX_CHARS} 字）`);
    expect(prompt.length).toBeLessThan(INPUT_MAX_CHARS + 200);
  });

  it("解析容忍代码块包裹，清理标题首尾的引号与句号", () => {
    const text =
      '```json\n{"title":"「卡片是连接的枢纽。」","summary":" 要点 ","concepts":["卡片",1,""],"claims":"x"}\n```';
    expect(parseContentAiOutput(text)).toEqual({
      title: "卡片是连接的枢纽",
      summary: "要点",
      concepts: ["卡片"],
      claims: [],
    });
  });

  it("没有标题或不是 JSON 视为失败", () => {
    expect(parseContentAiOutput('{"summary":"只有要点"}')).toBeNull();
    expect(parseContentAiOutput("标题：xxx")).toBeNull();
    expect(parseContentAiOutput("{bad json}")).toBeNull();
  });

  it("标题按显示宽度计长：英文单词与数字串各算 1", () => {
    expect(titleDisplayLength("用 extractContents 替代 surroundContents 处理跨标签选区")).toBe(12);
    expect(titleDisplayLength("宇宙由5%常规物质")).toBe(9);
    expect(titleDisplayLength("Node.js 与 ES2025")).toBe(3);
  });
});
