import { describe, expect, it } from "vitest";
import { PdfActionType, PdfAnnotationSubtype, PdfBlendMode, PdfZoomMode } from "@embedpdf/models";
import type {
  PdfAnnotationObject,
  PdfBookmarkObject,
  PdfDestinationObject,
} from "@embedpdf/models";
import { EHighlightColor, type PdfAnnotation } from "@/types";
import {
  COLOR_SPECS,
  annotationColor,
  annotationPage,
  annotationSnippet,
  applyQuote,
  colorFromHex,
  filterAnnotations,
  hasNote,
  isEngineAnnotation,
  layoutMarginNotes,
  layoutPins,
  marginFitClientWidth,
  markupDefaults,
  markupStyleOf,
  sortAnnotations,
  toggleStylePatch,
} from "../annotationModel";
import { activeOutlineKey, flattenOutline, targetPage } from "../outline";

const markup = (patch: Partial<PdfAnnotationObject> = {}): PdfAnnotationObject =>
  ({
    id: "a",
    type: PdfAnnotationSubtype.HIGHLIGHT,
    pageIndex: 0,
    rect: { origin: { x: 10, y: 100 }, size: { width: 50, height: 12 } },
    color: "#fde58b",
    custom: { text: "  based   solely on attention " },
    ...patch,
  }) as PdfAnnotationObject;

const record = (id: number, patch: Partial<PdfAnnotation> = {}): PdfAnnotation => ({
  id,
  createTime: 0,
  updateTime: 0,
  pdfId: 1,
  annotation: markup({ id: `obj-${id}` }),
  notes: [],
  ...patch,
});

const withNote = (text: string) => [
  { id: "n", note: [{ type: "paragraph", children: [{ type: "formatted", text }] }] as never },
];

describe("颜色", () => {
  it("写进 PDF 的颜色精确匹配到色名", () => {
    expect(colorFromHex("#FDE58B")).toBe(EHighlightColor.Yellow);
    expect(colorFromHex("#b8d3ff")).toBe(EHighlightColor.Blue);
  });

  it("引擎默认色、其他阅读器的颜色归到最近的一档", () => {
    expect(colorFromHex("#FFCD45")).toBe(EHighlightColor.Yellow);
    expect(colorFromHex("#E44234")).toBe(EHighlightColor.Red);
  });

  it("不是颜色返回 null", () => {
    expect(colorFromHex(undefined)).toBeNull();
    expect(colorFromHex("red")).toBeNull();
  });

  it("文本标注看 PDF 里的颜色，区域标注看记录，缺省为黄", () => {
    expect(annotationColor(record(1, { annotation: markup({ color: "#b2f1b7" } as never) }))).toBe(
      EHighlightColor.Green
    );
    expect(annotationColor(record(2, { type: "area", color: EHighlightColor.Purple }))).toBe(
      EHighlightColor.Purple
    );
    expect(annotationColor(record(3, { type: "area" }))).toBe(EHighlightColor.Yellow);
  });

  it("界面色块走主题数据色，不写裸色值", () => {
    for (const spec of Object.values(COLOR_SPECS)) {
      expect(spec.swatch).toMatch(/^bg-tag-\d$/);
      expect(spec.border).toMatch(/^border-tag-\d$/);
    }
  });
});

describe("样式", () => {
  it("新建只给高亮 / 下划线，高亮带正片叠底", () => {
    expect(markupDefaults("highlight", EHighlightColor.Red)).toMatchObject({
      type: PdfAnnotationSubtype.HIGHLIGHT,
      color: COLOR_SPECS[EHighlightColor.Red].pdfHex,
      blendMode: PdfBlendMode.Multiply,
    });
    expect(markupDefaults("underline", EHighlightColor.Red)).not.toHaveProperty("blendMode");
  });

  it("切换：高亮 → 下划线，其余（含波浪线 / 删除线）→ 高亮", () => {
    expect(toggleStylePatch("highlight").type).toBe(PdfAnnotationSubtype.UNDERLINE);
    expect(toggleStylePatch("underline").type).toBe(PdfAnnotationSubtype.HIGHLIGHT);
    expect(toggleStylePatch("squiggly").type).toBe(PdfAnnotationSubtype.HIGHLIGHT);
  });

  it("识别旧的波浪线、删除线", () => {
    expect(markupStyleOf(markup({ type: PdfAnnotationSubtype.SQUIGGLY }))).toBe("squiggly");
    expect(markupStyleOf(markup({ type: PdfAnnotationSubtype.STRIKEOUT }))).toBe("strikeout");
    expect(markupStyleOf(markup({ type: PdfAnnotationSubtype.INK }))).toBeNull();
  });
});

describe("摘录、排序、筛选", () => {
  it("摘录取 custom.text 并压空白；区域标注给页码", () => {
    expect(annotationSnippet(record(1))).toBe("based solely on attention");
    const area = record(2, {
      type: "area",
      areaData: { rect: { x: 0, y: 0, width: 1, height: 1 }, captureUrl: "u", pageIndex: 3 },
    });
    expect(annotationPage(area)).toBe(4);
    expect(annotationSnippet(area)).toBe("区域截图 · 第 4 页");
  });

  it("按页、再按页内位置排序", () => {
    const a = record(1, { annotation: markup({ id: "a", pageIndex: 1 }) });
    const b = record(2, {
      annotation: markup({
        id: "b",
        rect: { origin: { x: 0, y: 300 }, size: { width: 1, height: 1 } },
      }),
    });
    const c = record(3, { annotation: markup({ id: "c" }) });
    expect(sortAnnotations([a, b, c]).map(r => r.id)).toEqual([3, 2, 1]);
  });

  it("有笔记 = 笔记里有字；按颜色筛选", () => {
    const empty = record(1, { notes: withNote("   ") });
    const noted = record(2, { notes: withNote("RNN 必须串行") });
    const blue = record(3, { annotation: markup({ id: "x", color: "#b8d3ff" } as never) });
    expect(hasNote(empty)).toBe(false);
    expect(filterAnnotations([empty, noted, blue], "notes")).toEqual([noted]);
    expect(filterAnnotations([empty, noted, blue], EHighlightColor.Blue)).toEqual([blue]);
  });
});

describe("页边图钉", () => {
  it("对齐标注顶端，挤在一起时向下错开", () => {
    const at = (id: number, y: number) =>
      record(id, {
        annotation: markup({
          id: `p${id}`,
          rect: { origin: { x: 0, y }, size: { width: 1, height: 1 } },
        }),
      });
    const slots = layoutPins([at(1, 100), at(2, 105), at(3, 400)], 1.5, 22);
    expect(slots.map(s => s.top)).toEqual([150, 176, 600]);
  });
});

describe("页边批注", () => {
  const margin = (id: number, text: string) =>
    record(id, {
      type: "margin",
      annotation: markup({ id: `m${id}`, type: 0 as never, color: undefined }),
      notes: withNote(text),
    });

  it("不进引擎、摘录给页码、不进颜色筛选", () => {
    const note = margin(1, "随手一记");
    expect(isEngineAnnotation(note)).toBe(false);
    expect(isEngineAnnotation(record(2, { type: "area" }))).toBe(false);
    expect(isEngineAnnotation(record(3))).toBe(true);
    expect(annotationSnippet(note)).toBe("页边批注 · 第 1 页");
    expect(filterAnnotations([note], "notes")).toEqual([note]);
    expect(filterAnnotations([note], EHighlightColor.Yellow)).toEqual([]);
  });

  it("顶端对齐锚点、重叠时顺排；越过页底的不显示并计数", () => {
    const { slots, hidden } = layoutMarginNotes(
      [
        { id: 1, anchor: 100, height: 40 },
        { id: 2, anchor: 110, height: 40 },
        { id: 3, anchor: 300, height: 40 },
        { id: 4, anchor: 320, height: 80 },
        { id: 5, anchor: 330, height: 20 },
      ],
      420
    );
    expect(slots).toEqual([
      { id: 1, top: 100 },
      { id: 2, top: 148 },
      { id: 3, top: 300 },
    ]);
    expect(hidden).toBe(2);
  });

  it("适宽折算：页面 + 页边恰好放进视口", () => {
    const gap = 24;
    const fitted = marginFitClientWidth(1000, gap, 0.38);
    const pageWidth = fitted - 2 * gap;
    expect(pageWidth * 1.38).toBeCloseTo(1000 - 2 * gap);
  });

  it("对话引用标为页边批注", () => {
    const content = applyQuote([{ type: "text", text: "对吗？" }], {
      kind: "margin",
      pageNumber: 2,
      text: "随手一记",
    });
    expect(content[0]).toEqual({
      type: "text",
      text: "> 第 2 页 · 页边批注\n> 随手一记\n\n对吗？",
    });
  });
});

describe("对话引用", () => {
  it("原文作为引用块放在问题前，截图作为图片附件", () => {
    const content = applyQuote([{ type: "text", text: "为什么？" }], {
      kind: "area",
      pageNumber: 4,
      text: "第一行\n第二行",
      imageUrl: "https://img/x.png",
    });
    expect(content[0]).toEqual({
      type: "text",
      text: "> 第 4 页 · 区域截图\n> 第一行\n> 第二行\n\n为什么？",
    });
    expect(content[1]).toEqual({
      type: "image",
      image: "https://img/x.png",
      path: "https://img/x.png",
    });
  });

  it("没有文字时单独插入引用块", () => {
    const content = applyQuote([{ type: "image", image: "a" }], {
      kind: "selection",
      pageNumber: 1,
      text: "abc",
    });
    expect(content[0]).toEqual({ type: "text", text: "> 第 1 页 · 选区\n> abc" });
  });
});

describe("目录", () => {
  const destination = (pageIndex: number): PdfDestinationObject => ({
    pageIndex,
    zoom: { mode: PdfZoomMode.Unknown },
    view: [],
  });
  const outline: PdfBookmarkObject[] = [
    {
      title: "1 Introduction",
      target: { type: "destination", destination: destination(0) },
      children: [
        {
          title: "1.1 Background",
          target: {
            type: "action",
            action: { type: PdfActionType.Goto, destination: destination(2) },
          },
        },
      ],
    },
    { title: "", target: { type: "destination", destination: destination(5) } },
    { title: "外链", target: { type: "action", action: { type: PdfActionType.Unsupported } } },
  ];

  it("取目标页（从 1 开始）；外链没有页", () => {
    expect(targetPage(outline[0])).toBe(1);
    expect(targetPage((outline[0].children ?? [])[0])).toBe(3);
    expect(targetPage(outline[2])).toBeNull();
  });

  it("拍平带层级，空标题给占位", () => {
    const rows = flattenOutline(outline);
    expect(rows.map(r => [r.title, r.depth, r.page])).toEqual([
      ["1 Introduction", 0, 1],
      ["1.1 Background", 1, 3],
      ["（无标题）", 0, 6],
      ["外链", 0, null],
    ]);
  });

  it("当前页所在章节 = 最后一个起始页不超过当前页的条目", () => {
    const rows = flattenOutline(outline);
    expect(activeOutlineKey(rows, 2)).toBe("0");
    expect(activeOutlineKey(rows, 4)).toBe("0.0");
    expect(activeOutlineKey(rows, 9)).toBe("1");
  });
});
