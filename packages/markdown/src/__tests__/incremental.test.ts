import { expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import {
  addExportFootnote,
  createMarkdownProcessor,
  type MarkdownCodec,
  type MarkdownTextCodec,
} from "../index.ts";
import { paragraphCodec } from "./fixtures.ts";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const frozen = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
};

it("局部修改只转换变化块，重排、空输出、尾部分隔与全量一致", () => {
  const convert = vi.fn((element, children: string) => (element.hidden ? "" : children));
  const codec: MarkdownCodec = {
    ...paragraphCodec,
    serializer: { isBlock: true, toMarkdown: convert },
  };
  const md = createMarkdownProcessor({ codecs: [codec] });
  const serialize = md.createIncrementalSerializer({ codecs: [codec], textCodecs: [] });
  const first = frozen(paragraph("甲")),
    second = frozen(paragraph("乙")),
    third = frozen(paragraph("丙"));
  serialize([first, second, third]);
  expect(convert).toHaveBeenCalledTimes(3);
  convert.mockClear();
  const updated = frozen(paragraph("乙更新"));
  const result = serialize([first, updated, third]);
  expect(convert).toHaveBeenCalledTimes(1);
  expect(result).toBe(md.getMarkdown(structuredClone([first, updated, third])));
  const empty = frozen({ ...paragraph("忽略"), hidden: true } as Descendant);
  for (const value of [[third, first], [first], [first, empty], [empty, first, third], []]) {
    expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
  }
});

it("脚注编号与定义在插入、删除和重排后始终与全量一致", () => {
  const note: MarkdownCodec = {
    type: "annotation",
    serializer: { toMarkdown: node => `[^${addExportFootnote(node.content)}]` },
  };
  const md = createMarkdownProcessor({ codecs: [paragraphCodec, note] });
  const serialize = md.createIncrementalSerializer({
    codecs: [paragraphCodec, note],
    textCodecs: [],
  });
  const block = (text: string, content: string) =>
    frozen({
      type: "paragraph",
      children: [
        { type: "formatted", text },
        { type: "annotation", content, children: [{ type: "formatted", text: "" }] },
      ],
    } as Descendant);
  const a = block("甲", "注甲"),
    b = block("乙", "注乙"),
    plain = frozen(paragraph("普通段落"));
  for (const value of [[a, b], [plain, a, b], [b, a], [a], [plain], [b, plain, a], []]) {
    const expected = md.getMarkdown(structuredClone(value));
    expect(serialize(value)).toBe(expected);
    expect(md.getMarkdownWithPositions(structuredClone(value)).markdown).toBe(expected);
    expect(serialize(value)).toBe(expected);
  }
});

it("未声明插件每次执行且可操作独立副本，未知数据与父上下文保真", () => {
  let suffix = "一";
  const plugin: MarkdownCodec = {
    type: "external.inline",
    serializer: {
      toMarkdown: (node, _children, parent) => {
        node.custom.items.push("临时");
        parent.seen = (parent.seen ?? 0) + 1;
        return `${parent.seen}:${node.custom.items.length}:${suffix}`;
      },
    },
  };
  const md = createMarkdownProcessor({ codecs: [paragraphCodec, plugin] });
  const serialize = md.createIncrementalSerializer({ codecs: [paragraphCodec], textCodecs: [] });
  const value = frozen([
    {
      type: "paragraph",
      children: [
        { type: "formatted", text: "" },
        {
          type: "external.inline",
          text: "元素自己的文本字段",
          custom: { items: ["保留"] },
          children: [{ type: "formatted", text: "" }],
        },
        {
          type: "external.inline",
          text: "另一个元素文本字段",
          custom: { items: [] },
          children: [{ type: "formatted", text: "" }],
        },
      ],
    },
    {
      type: "unknown.block",
      vendor: { enabled: true },
      children: [{ type: "formatted", text: "未知" }],
    },
  ] as unknown as Descendant[]);
  for (const next of ["一", "二", "三"]) {
    suffix = next;
    expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
  }
  expect((value[0] as unknown as { seen?: number }).seen).toBeUndefined();
});

it("未声明的文本 codec 和可变节点不复用过期结果", () => {
  let prefix = "一";
  const text: MarkdownTextCodec = {
    id: "test",
    keys: ["custom"],
    importRules: [],
    exportWrap: () => ({ prefix, suffix: "" }),
  };
  const md = createMarkdownProcessor({ codecs: [paragraphCodec], textCodecs: [text] });
  const serialize = md.createIncrementalSerializer({ codecs: [paragraphCodec], textCodecs: [] });
  const value = frozen([
    { type: "paragraph", children: [{ type: "formatted", text: "正文", custom: true }] },
  ] as unknown as Descendant[]);
  expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
  prefix = "二";
  expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
  const mutable = [paragraph("原文")];
  serialize(mutable);
  (mutable[0] as { children: Array<{ text: string }> }).children[0].text = "新文";
  expect(serialize(mutable)).toBe(md.getMarkdown(structuredClone(mutable)));
});

it("仅浅冻结的节点仍走完整转换，属性和子数组变化不会读到旧缓存", () => {
  const codec: MarkdownCodec = {
    ...paragraphCodec,
    serializer: { isBlock: true, toMarkdown: (node, children) => `${node.meta.title}:${children}` },
  };
  const md = createMarkdownProcessor({ codecs: [codec] });
  const serialize = md.createIncrementalSerializer({ codecs: [codec], textCodecs: [] });
  const node = Object.freeze({
    type: "paragraph",
    meta: { title: "甲" },
    children: [{ type: "formatted", text: "正文" }],
  });
  const value = [node] as unknown as Descendant[];
  expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
  node.meta.title = "乙";
  node.children.push({ type: "formatted", text: "新增" });
  expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
});
