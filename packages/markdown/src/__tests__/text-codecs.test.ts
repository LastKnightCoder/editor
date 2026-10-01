import { describe, expect, it } from "vitest";
import { createMarkdownProcessor, type MarkdownTextCodec } from "../index.ts";
import { paragraphCodec, fixtureProcessor } from "./fixtures.ts";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";
import type { FormattedText } from "../model.ts";

const leaf = (fields: Record<string, unknown> = {}): FormattedText => ({
  type: "formatted",
  text: "正文",
  ...fields,
});
const value = (fields: Record<string, unknown> = {}) => [
  { type: "paragraph", children: [leaf(fields)] },
];
const rating: MarkdownTextCodec = {
  id: "test.rating",
  keys: ["rating"],
  importRules: [
    {
      nodeType: "textDirective",
      directive: "rating",
      content: "children",
      readMarks: node => ({ rating: Number(node.attributes?.value) }),
    },
  ],
  exportWrap: item => ({
    prefix: ":rating[",
    suffix: `]{value=${(item as unknown as { rating: number }).rating}}`,
  }),
};

describe("纯文本 codec", () => {
  it("第三方标记经同一协议导入/导出，两个导入入口内容一致", () => {
    const md = createMarkdownProcessor({
      codecs: [paragraphCodec],
      textCodecs: [rating, textFormattingCodec],
    });
    const source = ":rating[**正文**]{value=2}";
    const content = md.importFromMarkdown(source);
    expect(content).toEqual(value({ rating: 2, bold: true }));
    expect(md.importFromMarkdownWithPositions(source).content).toEqual(content);
    expect(md.getMarkdown(content)).toBe(md.getMarkdownWithPositions(content).markdown);
    expect(md.importFromMarkdown(md.getMarkdown(content))).toEqual(content);
  });

  it("不注册格式时不暗中认领加粗，缺 codec 字段不能静默丢弃", () => {
    const bare = createMarkdownProcessor({ codecs: [paragraphCodec] });
    expect(bare.importFromMarkdown("**正文**")).toEqual(value());
    expect(bare.importFromMarkdown(bare.getMarkdown(value({ bold: true })))).toEqual(
      value({ bold: true })
    );
    expect(fixtureProcessor.getMarkdown(value({ bold: true })).trim()).toBe("**正文**");
  });

  it.each(["text", "type", "children", ""])("拒绝保留或空字段 %s", key => {
    expect(() => createMarkdownProcessor({ textCodecs: [{ ...rating, keys: [key] }] })).toThrow(
      /文本字段/
    );
  });

  it("拒绝重复 id、字段及语法认领", () => {
    for (const second of [
      { ...rating, keys: ["other"], importRules: [] },
      { ...rating, id: "other", importRules: [] },
      { ...rating, id: "other", keys: ["other"] },
    ])
      expect(() => createMarkdownProcessor({ textCodecs: [rating, second] })).toThrow(/重复/);
  });

  it("普通与位置导入都校验字段所有权，拒绝异步认领", async () => {
    for (const readMarks of [
      () => ({ bold: true }),
      () => ({ rating: new Date() }),
      () => Promise.reject(new Error("异步")),
    ]) {
      const md = createMarkdownProcessor({
        codecs: [paragraphCodec],
        textCodecs: [
          { ...rating, importRules: [{ ...rating.importRules[0], readMarks: readMarks as never }] },
        ],
      });
      expect(() => md.importFromMarkdown(":rating[正文]{value=2}")).toThrow();
      expect(() => md.importFromMarkdownWithPositions(":rating[正文]{value=2}")).toThrow();
      await Promise.resolve();
    }
  });

  it("导出错误使用保真载体而非丢失标记的普通文字", () => {
    const md = createMarkdownProcessor({
      codecs: [paragraphCodec],
      textCodecs: [
        {
          ...rating,
          exportWrap: () => {
            throw new Error("编码失败");
          },
        },
      ],
    });
    expect(md.importFromMarkdown(md.getMarkdown(value({ rating: 2 })))).toEqual(
      value({ rating: 2 })
    );
    expect(
      md.importFromMarkdownWithPositions(md.getMarkdownWithPositions(value({ rating: 2 })).markdown)
        .content
    ).toEqual(value({ rating: 2 }));
  });

  it("嵌套格式按内层值覆盖，两个导入入口一致", () => {
    const source = ":highlight[外:highlight[内]{color=blue}外]{color=red}";
    const md = fixtureProcessor;
    const parsed = md.importFromMarkdown(source);
    expect(parsed).toEqual([
      {
        type: "paragraph",
        children: [
          leaf({ text: "外", highlight: "red" }),
          leaf({ text: "内", highlight: "blue" }),
          leaf({ text: "外", highlight: "red" }),
        ],
      },
    ]);
    expect(md.importFromMarkdownWithPositions(source).content).toEqual(parsed);
  });

  it("保持既有包裹顺序和历史无输出字段，结构化出口与普通出口同源", () => {
    const item = leaf({
      code: true,
      italic: true,
      strikethrough: true,
      bold: true,
      textGradient: "ocean",
      color: "red",
      darkColor: "blue",
      highlight: "yellow",
      underline: true,
    });
    const result = fixtureProcessor.leafToMarkdownStructured(item);
    expect(result.output).toBe(
      ":highlight[:gradient[**~~*`正文`*~~**]{preset=ocean}]{color=yellow}"
    );
    expect(result.output).toBe(fixtureProcessor.leafToMarkdown(item));
    expect(result.output.length).toBe(result.prefixLength + item.text.length + result.suffixLength);
    expect(
      fixtureProcessor.leafToMarkdown(leaf({ underline: true, highlight: true, color: "red" }))
    ).toBe("正文");
  });

  it("处理器及嵌套调用互不污染", () => {
    const other = createMarkdownProcessor({
      codecs: [paragraphCodec],
      textCodecs: [textFormattingCodec],
    });
    const custom = createMarkdownProcessor({
      codecs: [paragraphCodec],
      textCodecs: [
        {
          ...rating,
          exportWrap: () => ({
            prefix: other.leafToMarkdown(leaf({ text: "x", bold: true })) + "[",
            suffix: "]",
          }),
        },
      ],
    });
    expect(custom.leafToMarkdown(leaf({ rating: 2 }))).toBe("**x**[正文]");
    expect(other.leafToMarkdown(leaf({ italic: true }))).toBe("*正文*");
    expect(other.leafToMarkdown(leaf({ rating: 2 }))).toContain(":tau-node[");
  });

  it("非法渐变名称不被对象原型成员误认", () => {
    for (const preset of ["constructor", "toString", "__proto__"]) {
      const content = fixtureProcessor.importFromMarkdown(`:gradient[正文]{preset=${preset}}`);
      expect(content).toEqual(value());
    }
  });
});
