import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "../processor.ts";
import { encodeTauMarkdown, decodeTauMarkdown, getTauMarkdownWithPositions } from "../tau/index.ts";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import type { Descendant } from "slate";

const processor = createMarkdownProcessor({
  codecs: [...editorMarkdownCodecs],
  textCodecs: [textFormattingCodec],
});
const content = (value: unknown) => value as Descendant[];
const cell = (text: string, extra = {}) => ({
  type: "table-cell",
  collabId: "cell-" + text,
  tauContract: "cell-contract",
  ...extra,
  children: [{ type: "formatted", text }],
});
const fixture = () =>
  content([
    {
      type: "table",
      collabId: "table",
      tauContract: "table-contract",
      align: [null, "center"],
      future: { rating: -0, names: ["甲", null, true] },
      children: [
        {
          type: "table-row",
          color: "blue",
          collabId: "row-a",
          tauContract: "row-contract",
          children: [cell("任务 A", { rowSpan: 2 }), cell("进行中")],
        },
        {
          type: "table-row",
          color: "green",
          collabId: "row-b",
          tauContract: "row-contract",
          children: [cell(""), cell("完成", { future: { badge: "?" } })],
        },
      ],
    },
  ]);
const options = {
  processor,
  metadata: { contracts: { example: { type: "table", dataVersion: 1 } } },
};

describe("Tau Markdown 可逆协议", () => {
  it("保留身份、契约、颜色、合并、未知属性及没有 codec 的完整节点", () => {
    const original = fixture();
    const source = encodeTauMarkdown(original, options);
    const decoded = decodeTauMarkdown(source, options);
    expect(decoded.content).toEqual(original);
    expect(decoded.metadata).toEqual(options.metadata);
    expect(encodeTauMarkdown(decoded.content, { ...options, metadata: decoded.metadata })).toBe(
      source
    );
  });

  it("只修改行属性时保留其余所有原生信息", () => {
    const original = fixture();
    const source = encodeTauMarkdown(original, options);
    const changed = source.replace('"color":"blue"', '"color":"red"');
    const expected = fixture();
    const table = expected[0];
    if (!("children" in table)) throw new Error("缺少表格");
    Object.assign(table.children[0], { color: "red" });
    expect(decodeTauMarkdown(changed, options).content).toEqual(expected);
  });

  it("行容器重排时内容、身份与颜色一起移动", () => {
    const original = fixture();
    const { markdown, positionMap } = getTauMarkdownWithPositions(original, options);
    const ranges = [0, 1].map(index => positionMap.getElementMappingBySlatePath([0, index]));
    const lines = markdown.split("\n");
    if (!ranges[0] || !ranges[1]) throw new Error("缺少行位置");
    const a = ranges[0],
      b = ranges[1];
    const changed = [
      ...lines.slice(0, a.mdStartLine),
      ...lines.slice(b.mdStartLine, b.mdEndLine + 1),
      ...lines.slice(a.mdEndLine + 1, b.mdStartLine),
      ...lines.slice(a.mdStartLine, a.mdEndLine + 1),
      ...lines.slice(b.mdEndLine + 1),
    ].join("\n");
    const expected = fixture();
    const table = expected[0];
    if (!("children" in table)) throw new Error("缺少表格");
    table.children.reverse();
    expect(decodeTauMarkdown(changed, options).content).toEqual(expected);
  });

  it.each([
    "",
    "  前后空白  ",
    "\u0000\t\r\n尾行\n",
    "\u200b\u200c\u200d\ufeff",
    "中文 😀 e\u0301 \u2028",
    "孤立代理：\ud800 / \udc00 / 正常😀",
    ":::tau {}\n:::\n\u0060\u0060\u0060tau-text\n\u0060\u0060\u0060\u0060\n末尾",
    "**这是普通字符而非加粗** | :tau-node[字面量]",
  ])("字面量文本边界往返保真：%j", text => {
    const original = content([
      {
        type: "future-node",
        collabId: "node",
        source: "a\n" + text,
        children: [{ type: "formatted", text, futureMark: { value: 2 } }],
      },
    ]);
    const source = encodeTauMarkdown(original, options);
    expect(decodeTauMarkdown(source, options).content).toEqual(original);
  });

  it("能无损表达的行内 Markdown 仍支持修改格式和文字", () => {
    const original = content([
      {
        type: "paragraph",
        collabId: "p",
        children: [{ type: "formatted", text: "原文", bold: true }],
      },
    ]);
    const source = encodeTauMarkdown(original, options);
    const changed = source.replace("**原文**", "*新文*");
    expect(changed).not.toBe(source);
    expect(decodeTauMarkdown(changed, options).content).toEqual([
      {
        type: "paragraph",
        collabId: "p",
        children: [{ type: "formatted", text: "新文", italic: true }],
      },
    ]);
  });

  it("未知 marks 与相邻同格式叶子边界不被行内 codec 合并或删除", () => {
    const original = content([
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "同" },
          { type: "formatted", text: "格式" },
          { type: "formatted", text: "未知", tracking: { value: 2 } },
        ],
      },
    ]);
    expect(decodeTauMarkdown(encodeTauMarkdown(original, options), options).content).toEqual(
      original
    );
  });

  it("多行文字、Unicode 与源码字段保留双向位置", () => {
    const text = "甲😀\r\n乙\u200b\n末尾";
    const original = content([
      {
        type: "code-block",
        collabId: "code",
        code: "const value = 1;\nvalue++;",
        children: [{ type: "formatted", text, future: true }],
      },
    ]);
    const { positionMap, markdown } = getTauMarkdownWithPositions(original, options);
    for (let offset = 0; offset <= text.length; offset++) {
      const source = positionMap.slateToMarkdown({ path: [0, 0], offset });
      if (!source) throw new Error("文字位置缺失");
      expect(positionMap.markdownToSlate(source)).toEqual({ path: [0, 0], offset });
    }
    const mapping = positionMap.getElementMappingBySlatePath([0]);
    expect(mapping?.propertyMappings?.code).toMatchObject({ mdStartCh: 0 });
    expect(decodeTauMarkdown(markdown, options).content).toEqual(original);
  });

  it("JSON 字符串载体的代理字符仍有准确字符映射", () => {
    const text = "\ud800中文😀\n尾";
    const { positionMap } = getTauMarkdownWithPositions(
      content([
        {
          type: "paragraph",
          children: [{ type: "formatted", text }],
        },
      ])
    );
    for (let offset = 0; offset <= text.length; offset++) {
      const source = positionMap.slateToMarkdown({ path: [0, 0], offset });
      if (!source) throw new Error("JSON 字符边界缺失");
      expect(positionMap.markdownToSlate(source)).toEqual({ path: [0, 0], offset });
    }
  });

  it("属性中的原型键按普通数据保存且不污染对象原型", () => {
    const node = JSON.parse('{"type":"future","__proto__":{"polluted":true},"children":[]}');
    const original = content([node]);
    const restored = decodeTauMarkdown(encodeTauMarkdown(original));
    expect(restored.content).toEqual(original);
    expect(Reflect.get({}, "polluted")).toBeUndefined();
  });

  it("拒绝未知版本、损坏围栏、重复属性和静默降级", () => {
    const source = encodeTauMarkdown(fixture(), options);
    expect(() =>
      decodeTauMarkdown(source.replace("tau-markdown:1", "tau-markdown:999"), options)
    ).toThrow();
    expect(() => decodeTauMarkdown(source.slice(0, source.lastIndexOf(":::")), options)).toThrow();
    expect(() =>
      decodeTauMarkdown(source.replace('"color":"blue"', '"color":"blue","color":"red"'), options)
    ).toThrow();
    expect(() => decodeTauMarkdown("| 普通 | Markdown |", options)).toThrow();
    expect(() => decodeTauMarkdown(source + "\n未编码的正文", options)).toThrow();
  });

  it("在编码与解码入口执行容量和深度边界", () => {
    const original = content([
      { type: "paragraph", children: [{ type: "formatted", text: "文本" }] },
    ]);
    const source = encodeTauMarkdown(original);
    expect(() => encodeTauMarkdown(original, { limits: { maxChars: 8 } })).toThrow();
    expect(() => decodeTauMarkdown(source, { limits: { maxNodes: 1 } })).toThrow();
    const nested = content([
      { type: "a", children: [{ type: "b", children: [{ type: "c", children: [] }] }] },
    ]);
    expect(() => encodeTauMarkdown(nested, { limits: { maxDepth: 1 } })).toThrow();
    expect(() =>
      decodeTauMarkdown(encodeTauMarkdown(nested), { limits: { maxDepth: 1 } })
    ).toThrow();
  });
});
