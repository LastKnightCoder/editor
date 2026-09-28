import { describe, expect, it } from "vitest";
import { getMarkdown, importFromMarkdown, isMarkdownLikeText } from "../index.ts";

// 原 packages/editor/src/utils/__tests__/markdownImport.test.ts，随导入端合并迁入
describe("importFromMarkdown 选项与粘贴判定", () => {
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
    const firstChild = paragraph.children?.[0] as { type?: string; url?: string } | undefined;

    expect(content[0]).toMatchObject({ type: "paragraph" });
    expect(firstChild).toMatchObject({
      type: "link",
      url: "https://openai.com",
    });
  });

  it("中文标点相邻加粗应解析出加粗", () => {
    const content = importFromMarkdown("**加粗。**后续文本");
    const paragraph = content[0] as {
      children?: Array<{ text?: string; bold?: boolean }>;
    };

    expect(paragraph.children?.find(leaf => leaf.bold)?.text).toBe("加粗。");
    expect(paragraph.children?.find(leaf => leaf.text === "后续文本")?.bold).toBeFalsy();
  });

  it("中文标点相邻删除线应解析出删除线", () => {
    const content = importFromMarkdown("~~删除线。~~后续文本");
    const paragraph = content[0] as {
      children?: Array<{ text?: string; strikethrough?: boolean }>;
    };

    expect(paragraph.children?.find(leaf => leaf.strikethrough)?.text).toBe("删除线。");
  });

  it("导入时应剥离历史驻留的零宽空格", () => {
    const content = importFromMarkdown("中文\u200B**加粗**文本");
    const paragraph = content[0] as {
      children?: Array<{ text?: string; bold?: boolean }>;
    };

    expect(paragraph.children?.every(leaf => !leaf.text?.includes("\u200B"))).toBe(true);
    expect(paragraph.children?.find(leaf => leaf.bold)?.text).toBe("加粗");
  });

  it("customDirectives 应支持 container、leaf 与 text 三种 directive", () => {
    const handler = (attributes: Record<string, string | undefined>) =>
      ({
        type: "custom-directive",
        id: attributes.id || "",
        children: [{ type: "formatted", text: "" }],
      }) as never;
    const content = importFromMarkdown(
      [
        ":::custom-directive{id=container}",
        "内容",
        ":::",
        "",
        "::custom-directive{id=leaf}",
        "",
        ":custom-directive[文本]{id=text}",
      ].join("\n"),
      [],
      { customDirectives: { "custom-directive": handler } }
    );

    // container/leaf 为块级顶层节点；text 为行内节点，嵌在 paragraph 内
    const collectIds = (nodes: unknown[]): string[] =>
      nodes.flatMap(node => {
        const typed = node as { type?: string; id?: string; children?: unknown[] };
        return [
          ...(typed.type === "custom-directive" && typed.id ? [typed.id] : []),
          ...(typed.children ? collectIds(typed.children) : []),
        ];
      });
    expect(collectIds(content)).toEqual(["container", "leaf", "text"]);
  });

  it("customDirective handler 内再次导入不会串用外层的脚注上下文", () => {
    const content = importFromMarkdown("外层[^a]\n\n:::wrap\n:::\n\n[^a]: 外层脚注", [], {
      customDirectives: {
        wrap: () => {
          const inner = importFromMarkdown("内层[^a]\n\n[^a]: 内层脚注");
          return inner[0];
        },
      },
    });
    const text = JSON.stringify(content);
    expect(text).toContain("外层脚注");
    expect(text).toContain("内层脚注");
  });

  it("audio 的 title 导入导出往返保留", () => {
    const markdown = ':::audio{src="a.mp3" title="播客"}\n:::';
    const content = importFromMarkdown(markdown);
    expect(content[0]).toMatchObject({ type: "audio", title: "播客" });
    expect(getMarkdown(content).trim()).toBe(markdown);
  });
});
