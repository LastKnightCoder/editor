import { describe, expect, it } from "vitest";
import { createEditor, Element, Node, type Descendant } from "slate";
import { withReact } from "slate-react";
import type { InsightMark } from "@/types/content-insights";
import { anchorRanges, createInsightDecorate, orderedTextMarks } from "../anchors";
import { connectInsightMark } from "../connect";

const f = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "formatted",
  text,
  ...extra,
});
const doc = (): Descendant[] =>
  [
    { type: "header", level: 2, children: [f("布局")] },
    {
      type: "paragraph",
      children: [f("读 offsetTop 时会触发"), f("强制同步", { bold: true }), f("布局，代价很高。")],
    },
    { type: "paragraph", children: [f("只改 transform 时只走合成。")] },
  ] as unknown as Descendant[];

const mark = (
  id: string,
  block: number,
  anchor: string,
  extra: Partial<InsightMark> = {}
): InsightMark => ({
  id,
  kind: "link",
  block,
  anchor,
  text: "",
  why: "",
  status: "open",
  target: {
    ref: { kind: "card", id: 7 },
    contentId: 70,
    title: "掉帧排查",
    heading: "",
    block: 0,
    excerpt: "",
  },
  ...extra,
});

function editorWith(value: Descendant[]) {
  const editor = withReact(createEditor());
  const { isInline } = editor;
  editor.isInline = element =>
    (element as { type?: string }).type === "content-link" || isInline(element);
  editor.children = value;
  return editor;
}

describe("洞见标记定位", () => {
  it("跨格式叶子的片段拆成每个叶子一段", () => {
    const ranges = anchorRanges(doc(), 1, "触发强制同步布局")!;
    expect(ranges.map(r => [r.anchor.path, r.anchor.offset, r.focus.offset])).toEqual([
      [[1, 0], 14, 16],
      [[1, 1], 0, 4],
      [[1, 2], 0, 2],
    ]);
    expect(anchorRanges(doc(), 1, "不存在的话")).toBeNull();
    expect(anchorRanges(doc(), 9, "布局")).toBeNull();
  });

  it("decorate 只在顶层块返回，按正文顺序编号；已处理与可以展开不画", () => {
    const marks = [
      mark("b", 2, "只走合成"),
      mark("a", 1, "强制同步布局"),
      mark("c", 1, "代价", { status: "dismissed" }),
      mark("g", 2, "", { kind: "gap", text: "可以展开" }),
    ];
    expect(orderedTextMarks(marks).map(m => m.id)).toEqual(["a", "b"]);
    const value = doc();
    const decorate = createInsightDecorate(marks, () => value);
    expect(decorate([value[1] as Node, [1, 0]])).toEqual([]);
    const ranges = decorate([value[1] as Node, [1]]);
    expect(
      ranges.map(r => (r as unknown as { insightId: string; insightOrder: number }).insightOrder)
    ).toEqual([0, 0]);
    expect(decorate([value[2] as Node, [2]])[0]).toMatchObject({ insightId: "b", insightOrder: 1 });
  });

  it("连接：把片段包成 content-link，格式保留；已在链接里或找不到时不连", () => {
    const editor = editorWith(doc());
    expect(connectInsightMark(editor, mark("a", 1, "强制同步布局"))).toBe(true);
    const para = editor.children[1] as Element;
    const link = para.children.find(child => Element.isElement(child)) as unknown as {
      type: string;
      refId: number;
      contentId: number;
      contentType: string;
      contentTitle: string;
      children: Array<{ text: string; bold?: boolean }>;
    };
    expect(link).toMatchObject({
      type: "content-link",
      refId: 7,
      contentId: 70,
      contentType: "card",
      contentTitle: "掉帧排查",
    });
    expect(link.children.map(c => c.text).join("")).toBe("强制同步布局");
    expect(link.children.find(c => c.text === "强制同步")?.bold).toBe(true);
    expect(connectInsightMark(editor, mark("a", 1, "强制同步布局"))).toBe(false);
    // 片段从链接前开始、尾部压进既有链接（部分重叠）：与链接相交即拒绝，避免把旧链接包进新链接
    expect(connectInsightMark(editor, mark("b", 1, "触发强制同步"))).toBe(false);
    expect(connectInsightMark(editor, mark("x", 2, "改过的原文"))).toBe(false);
  });
});
