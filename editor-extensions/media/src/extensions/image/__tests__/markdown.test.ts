import type { Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { paragraphCodec } from "@tau/editor/markdown";
import { imageCodec } from "../markdown";
import { inlineImageCodec } from "../../inline-image/markdown";
import { linkCodec } from "@tau/editor-link/markdown";
import { blockquoteCodec } from "@tau/editor-blockquote/markdown";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";

vi.mock("uuid", () => ({ v4: () => "test-image-id" }));

const processor = createMarkdownProcessor({
  codecs: [paragraphCodec, imageCodec, inlineImageCodec, linkCodec, blockquoteCodec],
  textCodecs: [textFormattingCodec],
});

// 固定迁移前的段落规则，对照领域归属调整前后的输出及映射。
const legacy = createMarkdownProcessor({
  codecs: [
    {
      ...paragraphCodec,
      normalize: (element, context) => {
        if (element.children.length === 1 && element.children[0].type === "image") {
          const image = element.children[0];
          if (Array.isArray(image.children)) image.children = [{ type: "formatted", text: "" }];
          return [image];
        }
        element.children = element.children.map(context.demote);
        if (element.children.length === 0) return [];
        return null;
      },
    },
    { ...imageCodec, normalizeFor: undefined },
    inlineImageCodec,
    linkCodec,
    blockquoteCodec,
  ],
  textCodecs: [textFormattingCodec],
});

describe("图片 codec 拥有段落提升规则", () => {
  it("单图段落提升保持正文和元素位置，两种导入一致", () => {
    const markdown = "前文\n\n![说明](image.png)\n\n后文";
    const ordinary = processor.importFromMarkdown(markdown);
    const positioned = processor.importFromMarkdownWithPositions(markdown);
    expect(positioned.content).toEqual(ordinary);
    expect(ordinary[1]).toEqual({
      type: "image",
      url: "image.png",
      alt: "说明",
      children: [{ type: "formatted", text: "" }],
    });
    expect(positioned.positionMap.getMappings()).toEqual(
      legacy.importFromMarkdownWithPositions(markdown).positionMap.getMappings()
    );
    expect(processor.getMarkdown(ordinary).trim()).toBe(markdown);
  });

  it.each([
    "前 ![说明](image.png) 后",
    "[![说明](image.png)](https://example.com)",
    "**![说明](image.png)**",
    "> ![说明](image.png)",
  ])("行内、包装和引用场景与迁移前行为一致：%s", markdown => {
    const content = processor.importFromMarkdown(markdown);
    expect(processor.importFromMarkdownWithPositions(markdown).content).toEqual(content);
    const before = legacy.importFromMarkdown(markdown);
    expect(content).toEqual(before);
    expect(processor.getMarkdown(content)).toBe(legacy.getMarkdown(before));
    expect(processor.importFromMarkdown(processor.getMarkdown(content))).toEqual(
      legacy.importFromMarkdown(legacy.getMarkdown(before))
    );
    expect(processor.importFromMarkdownWithPositions(markdown).positionMap.getMappings()).toEqual(
      legacy.importFromMarkdownWithPositions(markdown).positionMap.getMappings()
    );
    if (!markdown.startsWith(">")) expect(content[0].type).toBe("paragraph");
  });

  it("仅装段落时不认识图片提升规则，恢复载体保持原节点", () => {
    const bare = createMarkdownProcessor({ codecs: [paragraphCodec] });
    const image = {
      type: "image",
      url: "unknown.png",
      alt: "未知图片",
      children: [{ type: "formatted", text: "" }],
    };
    const value = [{ type: "paragraph", children: [image] }] as unknown as Descendant[];
    const markdown = `:tau-node[未知图片]{type="image" json="${JSON.stringify(image).replaceAll('"', "&quot;")}"}`;
    expect(bare.importFromMarkdown(markdown)).toEqual(value);
    expect(bare.importFromMarkdownWithPositions(markdown).content).toEqual(value);
  });
});
