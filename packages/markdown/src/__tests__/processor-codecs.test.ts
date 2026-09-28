import type { Descendant } from "slate";
import { describe, expect, it } from "vitest";

import { createMarkdownProcessor, getMarkdown, importFromMarkdown } from "../index.ts";
import type { MarkdownCodec } from "../index.ts";

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
  it("内置处理器不认识宿主类型：directive 按原样退化为文本", () => {
    const value = importFromMarkdown(":mention{id=1}");
    expect(JSON.stringify(value)).not.toContain('"mention"');
  });

  it("注入 codec 后导入导出往返", () => {
    const md = createMarkdownProcessor({ codecs: [mentionCodec] });
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
    createMarkdownProcessor({ codecs: [mentionCodec] });
    const value = [
      {
        type: "paragraph",
        children: [{ type: "mention", id: 1, children: [{ type: "formatted", text: "" }] }],
      },
    ] as unknown as Descendant[];
    expect(getMarkdown(value)).not.toContain(":mention");
  });
});
