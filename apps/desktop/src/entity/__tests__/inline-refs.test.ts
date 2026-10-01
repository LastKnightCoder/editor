import { describe, expect, it } from "vitest";
import { extractInlineRefs, inlineCardIds } from "../inline-refs";

const text = (t: string) => ({ type: "formatted", text: t });
const link = (contentType: string, refId: unknown, title: string, contentId?: number) => ({
  type: "content-link",
  contentType,
  refId,
  contentId,
  contentTitle: title,
  children: [text(title)],
});
const p = (...children: unknown[]) => ({ type: "paragraph", children });

describe("extractInlineRefs", () => {
  it("取直接父块的前后文作片段，并点出链接文字", () => {
    const refs = extractInlineRefs([
      p(text("几何属性变了，就会触发"), link("card", 12, "重排与重绘", 99), text("，代价更高。")),
    ]);
    expect(refs).toEqual([
      {
        dst: { kind: "card", id: 12 },
        dstContentId: 99,
        snippet: { before: "几何属性变了，就会触发", label: "重排与重绘", after: "，代价更高。" },
      },
    ]);
  });

  it("收口存量类型写法，丢弃不认识的类型与非法 refId", () => {
    const refs = extractInlineRefs([
      p(
        link("project-item", 3, "渲染篇"),
        link("diary-daily", 4, "9 月 18 日"),
        link("white-board", 5, "白板"),
        link("card", "7", "坏数据")
      ),
    ]);
    expect(refs.map(r => r.dst)).toEqual([
      { kind: "project-item", id: 3 },
      { kind: "diary", id: 4 },
    ]);
    expect(refs[0].dstContentId).toBeNull();
  });

  it("递归进入列表、表格等容器", () => {
    const refs = extractInlineRefs([
      {
        type: "bulleted-list",
        children: [
          { type: "list-item", children: [p(text("见"), link("article", 8, "渲染流程"))] },
        ],
      },
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [p(link("card", 9, "合成层"))] }],
          },
        ],
      },
    ]);
    expect(refs.map(r => r.dst.id)).toEqual([8, 9]);
    expect(refs[0].snippet.before).toBe("见");
  });

  it("同一块内对同一目标只记一次，不同块分别记", () => {
    const refs = extractInlineRefs([
      p(link("card", 1, "A"), text(" 和 "), link("card", 1, "A")),
      p(link("card", 1, "A")),
    ]);
    expect(refs).toHaveLength(2);
  });

  it("同块的其他链接以标题代入片段，过长两侧截断", () => {
    const long = "很".repeat(100);
    const [first, second] = extractInlineRefs([
      p(text(long), link("card", 1, "甲"), text("与"), link("card", 2, "乙"), text(long)),
    ]);
    expect(first.snippet.before.startsWith("…")).toBe(true);
    expect(first.snippet.before.length).toBe(71);
    expect(first.snippet.after.startsWith("与乙")).toBe(true);
    expect(second.snippet.before.endsWith("甲与")).toBe(true);
    expect(second.snippet.after.endsWith("…")).toBe(true);
  });

  it("非数组或空正文返回空", () => {
    expect(extractInlineRefs(null)).toEqual([]);
    expect(extractInlineRefs("[]")).toEqual([]);
    expect(extractInlineRefs([])).toEqual([]);
  });
});

describe("extractInlineRefs：存量节点与独占一块的引用", () => {
  const bareLink = (refId: number, shown: string) => ({
    type: "content-link",
    contentType: "card",
    refId,
    contentTitle: "",
    children: [text(shown)],
  });
  const item = (...children: unknown[]) => ({ type: "list-item", children });
  const list = (...items: unknown[]) => ({ type: "bulleted-list", children: items });

  it("contentTitle 为空时用节点里显示的文字", () => {
    const [ref] = extractInlineRefs([p(text("见"), bareLink(1, "期货的概念"))]);
    expect(ref.snippet).toEqual({ before: "见", label: "期货的概念", after: "" });
  });

  it("引用独占一块时以上方有文字的块作前文；只含链接的块不算", () => {
    const refs = extractInlineRefs([
      p(text("本周小结：")),
      list(
        item(
          p(text("写作")),
          list(item(p(text(""), bareLink(1, "期货的概念"), text(""))), item(p(bareLink(2, "预热大脑"))))
        )
      ),
    ]);
    expect(refs.map(ref => ref.snippet)).toEqual([
      { before: "写作", label: "期货的概念", after: "" },
      { before: "写作", label: "预热大脑", after: "" },
    ]);
  });
});

describe("inlineCardIds", () => {
  it("只取卡片引用，保持出现顺序", () => {
    expect(
      inlineCardIds([
        p(link("card", 3, "x"), link("article", 4, "y")),
        { type: "blockquote", children: [p(link("card", 5, "z"), link("card", 3, "x"))] },
      ])
    ).toEqual([3, 5, 3]);
  });
});
