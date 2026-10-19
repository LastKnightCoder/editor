import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { createMarkdownProcessor, type MarkdownTextCodec } from "../index.ts";
import { paragraphCodec, fixtureProcessor } from "./fixtures.ts";
import type { FormattedText } from "../model.ts";
import { linkCodec } from "@tau/editor/extensions/link/markdown";

const md = createMarkdownProcessor({ codecs: [paragraphCodec] });
const documentOf = (text: string, extra: Record<string, unknown> = {}): Descendant[] =>
  [
    {
      type: "paragraph",
      children: [
        { type: "formatted", text, customMark: { label: '引号 " ] } & \\n', rating: 2 }, ...extra },
      ],
    },
  ] as unknown as Descendant[];

describe("未知文本字段保真", () => {
  it.each([
    "普通正文",
    "a|b",
    "a[b]\\c*粗体*_下划线_`code`",
    '引号 " & <tag>',
    ":tag{key=value}&amp;",
    "一\n\n二\r\n三\u2028四",
    "🙂中文",
    "\u200B\u200C\u200D\uFEFF",
    "",
    "字\t符",
  ])("两种入口保留完整文本及字段：%s", text => {
    const value = documentOf(text, {
      bold: true,
      metadata: { values: [null, false, 0, "\\path\\file"] },
    });
    const normal = md.getMarkdown(value);
    const positioned = md.getMarkdownWithPositions(value);
    expect(positioned.markdown).toBe(normal);
    expect(md.importFromMarkdown(normal)).toEqual(value);
    expect(md.importFromMarkdownWithPositions(normal).content).toEqual(value);
    expect(fixtureProcessor.importFromMarkdown(normal)).toEqual(value);
    expect(md.getMarkdown(md.importFromMarkdown(normal))).toBe(normal);
  });

  it.each(["a[b]\\c", "a|b", "一\n\n二\r\n三\t四", "🙂中文", "\u200B\u200D", ""])(
    "转义标签每个 UTF-16 边界双向精确映射：%s",
    text => {
      const value = documentOf(text);
      const exported = md.getMarkdownWithPositions(value);
      const imported = md.importFromMarkdownWithPositions(exported.markdown);
      for (let offset = 0; offset <= text.length; offset++) {
        const slate = { path: [0, 0], offset };
        const position = exported.positionMap.slateToMarkdown(slate);
        expect(position).not.toBeNull();
        if (!position) throw new Error("缺少映射");
        expect(exported.positionMap.markdownToSlate(position)).toEqual(slate);
        expect(imported.positionMap.slateToMarkdown(slate)).toEqual(position);
        expect(imported.positionMap.markdownToSlate(position)).toEqual(slate);
      }
      const mapping = exported.positionMap.getMappings()[0];
      expect(mapping.type).toBe("text");
      expect(
        exported.positionMap.markdownToSlate({ line: 0, ch: exported.markdown.indexOf("json=") })
      ).toEqual({ path: [0, 0], offset: text.length });
    }
  );

  it("标签被手工改写时 JSON 仍为事实源，映射明确回退到边界", () => {
    const value = documentOf("原文");
    const source = md.getMarkdown(value).replace(":tau-node[原文]", ":tau-node[另一个标签]");
    const imported = md.importFromMarkdownWithPositions(source);
    expect(imported.content).toEqual(value);
    expect(imported.positionMap.getMappings()[0]).toMatchObject({ type: "text", opaque: true });
    expect(imported.positionMap.slateToMarkdown({ path: [0, 0], offset: 1 })).toEqual({
      line: 0,
      ch: 0,
    });
  });

  it("损坏 JSON 保留为可读原文，不交给任意标记 codec", () => {
    const source = ':tau-node[正文]{type="formatted" json="{invalid}"}';
    expect(md.importFromMarkdown(source)).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: source }] },
    ]);
    expect(md.importFromMarkdownWithPositions(source).content).toEqual(
      md.importFromMarkdown(source)
    );
    expect(() =>
      createMarkdownProcessor({
        textCodecs: [
          {
            id: "override",
            keys: ["x"],
            importRules: [
              {
                nodeType: "textDirective",
                directive: "tau-node",
                content: "children",
                readMarks: () => ({ x: true }),
              },
            ],
            exportWrap: () => null,
          },
        ],
      })
    ).toThrow(/保留语法/);
  });

  it("编码异常及非法异步结果不丢字段，拒绝不可持久化数据", async () => {
    const codec: MarkdownTextCodec = {
      id: "bad",
      keys: ["customMark"],
      importRules: [],
      exportWrap: () => Promise.reject(new Error("失败")) as never,
    };
    const broken = createMarkdownProcessor({ codecs: [paragraphCodec], textCodecs: [codec] });
    const value = documentOf("内容");
    expect(broken.importFromMarkdown(broken.getMarkdown(value))).toEqual(value);
    await Promise.resolve();
    expect(() => md.getMarkdown(documentOf("内容", { invalid: () => undefined }))).toThrow(/JSON/);
  });

  it("危险指令属性及非法已知标记使用载体保存，不产生额外语法", () => {
    for (const extra of [
      { color: 'red} :other[注入]{x="', darkColor: "blue" },
      { textGradient: "constructor" },
      { highlight: { unexpected: true } },
    ]) {
      const value = [
        { type: "paragraph", children: [{ type: "formatted", text: "内容", ...extra }] },
      ] as unknown as Descendant[];
      const source = fixtureProcessor.getMarkdown(value);
      expect(source.startsWith(":tau-node[")).toBe(true);
      expect(fixtureProcessor.importFromMarkdown(source)).toEqual(value);
    }
  });

  it("处理器的叶子方法也保留未知字段", () => {
    const item = { type: "formatted", text: "内容", customMark: false } as FormattedText;
    expect(md.leafToMarkdownStructured(item).output).toBe(md.leafToMarkdown(item));
  });

  it("链接内的保真文本保持原路径和每个字符映射", () => {
    const nested = createMarkdownProcessor({ codecs: [paragraphCodec, linkCodec] });
    const text = "a[b]\\c\n下一行";
    const content = [
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: "https://example.test",
            children: [{ type: "formatted", text, customMark: true }],
          },
        ],
      },
    ] as unknown as Descendant[];
    const exported = nested.getMarkdownWithPositions(content);
    const imported = nested.importFromMarkdownWithPositions(exported.markdown);
    expect(imported.content).toEqual(content);
    for (let offset = 0; offset <= text.length; offset++) {
      const point = { path: [0, 0, 0], offset };
      const location = exported.positionMap.slateToMarkdown(point);
      if (!location) throw new Error("缺少链接内映射");
      expect(exported.positionMap.markdownToSlate(location)).toEqual(point);
      expect(imported.positionMap.markdownToSlate(location)).toEqual(point);
    }
  });

  it("codec 修改输入后失败也不能污染原文档", () => {
    const codec: MarkdownTextCodec = {
      id: "mutation",
      keys: ["customMark"],
      importRules: [],
      exportWrap: value => {
        (value as { text: string }).text = "污染";
        return null;
      },
    };
    const processor = createMarkdownProcessor({ codecs: [paragraphCodec], textCodecs: [codec] });
    const content = documentOf("原文");
    const before = JSON.stringify(content);
    const source = processor.getMarkdown(content);
    expect(JSON.stringify(content)).toBe(before);
    expect(processor.importFromMarkdown(source)).toEqual(content);
  });

  it("载体标签含物理换行时保守映射仍使用真实结束位置", () => {
    const content = documentOf("原文");
    const source = md.getMarkdown(content).replace("[原文]", "[另\n一行]");
    const result = md.importFromMarkdownWithPositions(source);
    expect(result.content).toEqual(content);
    const mapping = result.positionMap.getMappings()[0];
    expect(mapping).toMatchObject({ type: "text", opaque: true });
    if (mapping.type !== "text" || !mapping.mdEnd) throw new Error("缺少边界映射");
    expect(result.positionMap.slateToMarkdown({ path: [0, 0], offset: 2 })).toEqual(mapping.mdEnd);
    expect(result.positionMap.markdownToSlate(mapping.mdEnd)).toEqual({ path: [0, 0], offset: 2 });
  });
});
