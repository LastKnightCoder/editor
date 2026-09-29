import type { Descendant } from "slate";
import { describe, expect, it } from "vitest";

import { createMarkdownProcessor } from "../index.ts";
import type { MarkdownCodec } from "../index.ts";
import { paragraphCodec } from "./fixtures.ts";

// 宿主自定义的行内元素：:mention[名字]{id=1}
const mentionCodec: MarkdownCodec = {
  type: "mention",
  directives: {
    mention: attributes =>
      ({
        type: "mention",
        id: Number(attributes.id),
        children: [{ type: "formatted", text: "" }],
      }) as unknown as Descendant,
  },
  serializer: {
    toMarkdown: element => `:mention{id=${element.id}}`,
  },
};

describe("createMarkdownProcessor codecs", () => {
  it("无 codec 的处理器不认识宿主类型：directive 按原样退化为文本", () => {
    const value = createMarkdownProcessor().importFromMarkdown(":mention{id=1}");
    expect(JSON.stringify(value)).not.toContain('"mention"');
  });

  it("注入 codec 后导入导出往返", () => {
    const md = createMarkdownProcessor({ codecs: [paragraphCodec, mentionCodec] });
    const value = md.importFromMarkdown("你好 :mention{id=7}");
    expect(JSON.stringify(value)).toContain('"type":"mention"');
    expect(md.getMarkdown(value).trim()).toBe("你好 :mention{id=7}");
  });

  it("调用时传入的 customDirectives 覆盖处理器级 codec", () => {
    const md = createMarkdownProcessor({ codecs: [mentionCodec] });
    const value = md.importFromMarkdown(":mention{id=7}", [], {
      customDirectives: { mention: () => null },
    });
    expect(JSON.stringify(value)).not.toContain('"mention"');
  });

  it("不同处理器互不影响：一个注入的序列化器不会泄漏到另一个", () => {
    const value = [
      {
        type: "paragraph",
        children: [{ type: "mention", id: 1, children: [{ type: "formatted", text: "" }] }],
      },
    ] as unknown as Descendant[];
    expect(
      createMarkdownProcessor({ codecs: [paragraphCodec, mentionCodec] }).getMarkdown(value)
    ).toContain(":mention");
    // 同样的值交给只有 paragraph 的处理器：mention 不认识，走 ER-006 兜底而不是泄漏出指令文本
    expect(createMarkdownProcessor({ codecs: [paragraphCodec] }).getMarkdown(value)).not.toContain(
      ":mention{id=1}"
    );
  });

  it("isVoid 的 codec 在导入、导出两个方向都记元素级映射", () => {
    const md = createMarkdownProcessor({
      codecs: [
        {
          type: "attachment",
          isVoid: true,
          directives: {
            attachment: () =>
              ({
                type: "attachment",
                children: [{ type: "formatted", text: "" }],
              }) as unknown as Descendant,
          },
          serializer: { isBlock: true, toMarkdown: () => ":::attachment\n:::" },
        },
      ],
    });
    const imported = md.importFromMarkdownWithPositions("前文\n\n:::attachment\n:::\n\n后文\n");
    const index = imported.content.findIndex(
      node => (node as { type?: string }).type === "attachment"
    );
    expect(imported.positionMap.getElementMappingBySlatePath([index])?.isVoid).toBe(true);
    const exported = md.getMarkdownWithPositions(imported.content);
    expect(exported.positionMap.getElementMappingBySlatePath([index])?.isVoid).toBe(true);
  });
});
