import { describe, expect, it } from "vitest";
import { importFromMarkdown, isMarkdownLikeText } from "../markdownImport";

describe("markdownImport", () => {
  it("应识别常见 Markdown 结构", () => {
    expect(isMarkdownLikeText("# 标题")).toBe(true);
    expect(isMarkdownLikeText("- 列表项")).toBe(true);
    expect(isMarkdownLikeText("```ts\nconst a = 1;\n```")).toBe(true);
    expect(isMarkdownLikeText(":content-link[卡片]{contentId=1}")).toBe(true);
    expect(isMarkdownLikeText("普通文本")).toBe(false);
  });

  it("应将 Markdown 标题和列表导入为结构化节点", () => {
    const content = importFromMarkdown("# 标题\n\n- 第一项\n- 第二项");

    expect(content[0]).toMatchObject({
      type: "header",
      level: 1,
    });
    expect(content[1]).toMatchObject({
      type: "bulleted-list",
    });
  });

  it("应保留链接等行内结构", () => {
    const content = importFromMarkdown("[OpenAI](https://openai.com)");
    const paragraph = content[0] as { children?: unknown[] };
    const firstChild = paragraph.children?.[0] as
      | { type?: string; url?: string }
      | undefined;

    expect(content[0]).toMatchObject({ type: "paragraph" });
    expect(firstChild).toMatchObject({
      type: "link",
      url: "https://openai.com",
    });
  });
});
