import { describe, expect, it } from "vitest";
import { Node } from "slate";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";
import {
  createMarkdownProcessor,
  isMarkdownLikeText,
  type MarkdownCodec,
  type MarkdownImportNode,
} from "../index.ts";
import { fixtureProcessor, paragraphCodec } from "./fixtures.ts";

const importFromMarkdown = fixtureProcessor.importFromMarkdown;

// 原 packages/editor/src/utils/__tests__/markdownImport.test.ts，随导入端合并迁入
describe("importFromMarkdown 选项与粘贴判定", () => {
  it.each([
    ["strong", "前 **忽略** 后", "前  后"],
    ["inlineCode", "前 `忽略` 后", "前  后"],
    ["image", "前 ![忽略](https://example.com/image.png) 后", "前  后"],
    ["textDirective", "前 :drop[忽略] 后", "前  后"],
    ["code", "前\n\n```demo\n忽略\n```\n\n后", "前\n后"],
    ["heading", "# 忽略\n\n保留", "保留"],
  ])("%s 在父节点转换、插件认领和文本格式处理前统一过滤", (type, markdown, expected) => {
    const assertFiltered = (node: MarkdownImportNode) => {
      expect(node.type).not.toBe(type);
      node.children?.forEach(assertFiltered);
    };
    const guard: MarkdownCodec = {
      type: "test.guard",
      fence: { language: "demo" },
      directives: {
        drop: () => {
          throw new Error("被忽略的指令不应交给插件");
        },
      },
      importNode: (node, context) => {
        assertFiltered(node);
        if (context.parent) assertFiltered(context.parent);
        context.siblings.forEach(assertFiltered);
        return null;
      },
    };
    const processor = createMarkdownProcessor({
      codecs: [guard, paragraphCodec],
      textCodecs: [textFormattingCodec],
    });
    const content = processor.importFromMarkdown(markdown, [type]);
    expect(content.map(node => Node.string(node)).join("\n")).toBe(expected);
    expect(JSON.stringify(content)).not.toContain("test.guard");
    expect(processor.importFromMarkdownWithPositions(markdown, [type]).content).toEqual(content);
  });

  it.each([
    [["strong"], "引用保留 "],
    [["footnoteDefinition"], "引用"],
  ] as const)("脚注元信息同样按忽略类型 %j 过滤", (ignored, expected) => {
    const processor = createMarkdownProcessor({
      codecs: [
        paragraphCodec,
        {
          type: "test.footnote",
          importNode: (node, context) =>
            node.type === "footnoteReference"
              ? { type: "formatted", text: context.getFootnote(node.identifier ?? "") }
              : null,
        },
      ],
    });
    const markdown = "引用[^note]\n\n[^note]: 保留 **忽略**";
    const content = processor.importFromMarkdown(markdown, [...ignored]);
    expect(content.map(node => Node.string(node)).join("\n")).toBe(expected);
    expect(processor.importFromMarkdownWithPositions(markdown, [...ignored]).content).toEqual(
      content
    );
  });

  it("多个忽略类型共同生效，后续普通导入不继承过滤策略", () => {
    const markdown = "# 标题\n\n前 **强调** 与 `代码` 后";
    const original = fixtureProcessor.importFromMarkdown(markdown);
    const content = fixtureProcessor.importFromMarkdown(markdown, [
      "heading",
      "strong",
      "inlineCode",
    ]);
    expect(content.map(node => Node.string(node)).join("\n")).toBe("前  与  后");
    expect(fixtureProcessor.importFromMarkdown(markdown)).toEqual(original);
  });

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
