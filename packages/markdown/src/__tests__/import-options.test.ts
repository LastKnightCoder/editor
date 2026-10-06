import { describe, expect, it } from "vitest";
import { isMarkdownLikeText } from "../index.ts";
import { fixtureProcessor } from "./fixtures.ts";

const importFromMarkdown = fixtureProcessor.importFromMarkdown;

// 原 packages/editor/src/utils/__tests__/markdownImport.test.ts，随导入端合并迁入
describe("importFromMarkdown 选项与粘贴判定", () => {
  it("应识别常见 Markdown 结构", () => {
    expect(isMarkdownLikeText("# 标题")).toBe(true);
    expect(isMarkdownLikeText("- 列表项")).toBe(true);
    expect(isMarkdownLikeText("```ts\nconst a = 1;\n```")).toBe(true);
    expect(isMarkdownLikeText(":content-link[卡片]{contentId=1}")).toBe(true);
    expect(isMarkdownLikeText("普通文本")).toBe(false);
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
});
