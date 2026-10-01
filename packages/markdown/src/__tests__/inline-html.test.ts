import { describe, expect, it } from "vitest";
import type { Element } from "slate";
import { createMarkdownProcessor, type MarkdownCodec } from "../index.ts";
import { paragraphCodec } from "./fixtures.ts";

const wrapper: MarkdownCodec = {
  type: "external-shortcut",
  inlineHtmlWrapper: {
    tag: "shortcut",
    create: () => ({ type: "external-shortcut", children: [] }) as unknown as Element,
  },
};

describe("领域 HTML 包裹声明", () => {
  it("不依赖元素类型名认领标签，并保留嵌套内容和文本位置", () => {
    const processor = createMarkdownProcessor({ codecs: [paragraphCodec, wrapper] });
    const markdown = "a <shortcut>b <shortcut>c</shortcut> d</shortcut> z";
    const result = processor.importFromMarkdownWithPositions(markdown);
    expect(result.content).toEqual(processor.importFromMarkdown(markdown));
    expect(JSON.stringify(result.content).match(/external-shortcut/g)).toHaveLength(2);
    expect(
      result.positionMap
        .getMappings()
        .some(mapping => mapping.type === "text" && mapping.slateTextPath.join(".") === "0.1.1.0")
    ).toBe(true);
  });
  it("重复和非法标签在构造期拒绝，未闭合标签不构造领域节点", () => {
    expect(() =>
      createMarkdownProcessor({ codecs: [wrapper, { ...wrapper, type: "duplicate" }] })
    ).toThrow(/重复认领/);
    expect(() =>
      createMarkdownProcessor({
        codecs: [
          {
            ...wrapper,
            inlineHtmlWrapper: {
              ...wrapper.inlineHtmlWrapper!,
              tag: "not a tag",
            },
          },
        ],
      })
    ).toThrow(/无效/);
    const processor = createMarkdownProcessor({ codecs: [paragraphCodec, wrapper] });
    expect(JSON.stringify(processor.importFromMarkdown("a <shortcut>b"))).not.toContain(
      "external-shortcut"
    );
  });
});
