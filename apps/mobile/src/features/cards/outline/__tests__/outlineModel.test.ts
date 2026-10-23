import { createEditor, Node, Transforms, type Descendant } from "slate";
import { withHistory } from "slate-history";
import { describe, expect, it } from "vitest";
import {
  applyOrder,
  buildOutlineRows,
  isSnapshotStale,
  moveUnit,
  visibleUnits,
} from "../outlineModel";

const text = (value: string) => [{ type: "formatted", text: value }];
const paragraph = (value: string) =>
  ({ type: "paragraph", children: text(value) }) as unknown as Descendant;
const header = (level: number, value: string) =>
  ({ type: "header", level, children: text(value) }) as unknown as Descendant;
const voidBlock = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type, ...extra, children: text("") }) as unknown as Descendant;
const table = (rows: number) =>
  ({
    type: "table",
    children: Array.from({ length: rows }, () => ({
      type: "table-row",
      children: [{ type: "table-cell", children: [paragraph("格")] }],
    })),
  }) as unknown as Descendant;

function createDoc(children: Descendant[]) {
  const editor = withHistory(createEditor());
  // 只校验顶层重排，跳过 void / 表格的结构规范化
  editor.normalizeNode = () => {};
  editor.children = children;
  return editor;
}

const texts = (children: Descendant[]) => children.map(node => Node.string(node));

/** H1 A / p / H2 B / p / p / H2 C / p / H1 D / p */
const sectionDoc = () => [
  header(1, "A"),
  paragraph("a1"),
  header(2, "B"),
  paragraph("b1"),
  paragraph("b2"),
  header(2, "C"),
  paragraph("c1"),
  header(1, "D"),
  paragraph("d1"),
];

describe("buildOutlineRows", () => {
  it("标题读 level，sectionEnd 为其后第一个同级或更高级标题", () => {
    const rows = buildOutlineRows(sectionDoc());
    expect(rows.map(row => row.level)).toEqual([1, null, 2, null, null, 2, null, 1, null]);
    expect(rows.map(row => row.sectionEnd)).toEqual([7, 2, 5, 4, 5, 7, 7, 9, 9]);
  });

  it("摘要取去空白后的第一行、最多 40 字", () => {
    const long = "字".repeat(50);
    const [first, second] = buildOutlineRows([paragraph("  第一行\n第二行 "), paragraph(long)]);
    expect(first.label).toBe("第一行");
    expect(second.label).toBe("字".repeat(40));
  });

  it("空文本按类型描述", () => {
    const labels = buildOutlineRows([
      paragraph(""),
      voidBlock("image", { url: "a.png" }),
      voidBlock("code-block", { language: "ts", code: "", uuid: "1" }),
      table(3),
      voidBlock("block-math", { tex: "" }),
      voidBlock("mermaid", { chart: "" }),
      voidBlock("divide-line"),
      voidBlock("unknown-void"),
    ]).map(row => row.label);
    expect(labels).toEqual([
      "空段落",
      "图片",
      "代码块 · ts",
      "表格 · 3 行",
      "公式",
      "流程图",
      "分割线",
      "内容块",
    ]);
  });
});

describe("visibleUnits", () => {
  const rows = buildOutlineRows(sectionDoc());

  it("无折叠时每行一个单元", () => {
    const units = visibleUnits(rows, new Set());
    expect(units.map(unit => [unit.start, unit.end])).toEqual(
      rows.map(row => [row.index, row.index + 1])
    );
  });

  it("折叠标题覆盖整节并给出块数", () => {
    const units = visibleUnits(rows, new Set([2]));
    expect(units.map(unit => unit.key)).toEqual([0, 1, 2, 5, 6, 7, 8]);
    const collapsed = units.find(unit => unit.key === 2);
    expect([collapsed?.start, collapsed?.end, collapsed?.childCount]).toEqual([2, 5, 2]);
  });

  it("嵌套折叠以外层为准", () => {
    const units = visibleUnits(rows, new Set([0, 2, 5]));
    expect(units.map(unit => [unit.key, unit.start, unit.end])).toEqual([
      [0, 0, 7],
      [7, 7, 8],
      [8, 8, 9],
    ]);
  });

  it("没有子内容的标题不折叠", () => {
    const units = visibleUnits(buildOutlineRows([header(1, "A"), header(1, "B")]), new Set([0]));
    expect(units).toHaveLength(2);
  });

  it("key 经 keyOf 换算为原始下标", () => {
    const order = [3, 0, 1, 2];
    const children = [paragraph("x"), header(1, "H"), paragraph("y"), paragraph("z")];
    const current = order.map(index => children[index]);
    const units = visibleUnits(buildOutlineRows(current), new Set([1]), index => order[index]);
    expect(units.map(unit => unit.key)).toEqual([3, 0, 1]);
  });
});

describe("moveUnit", () => {
  const rows = buildOutlineRows(sectionDoc());
  const identity = rows.map(row => row.index);

  it("单块移动", () => {
    const units = visibleUnits(rows, new Set());
    expect(moveUnit(identity, units, 1, 3)).toEqual([0, 2, 3, 1, 4, 5, 6, 7, 8]);
    expect(moveUnit(identity, units, 8, 0)).toEqual([8, 0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("折叠标题整节移动", () => {
    const units = visibleUnits(rows, new Set([2]));
    // 可见单元：A a1 [B b1 b2] C c1 D d1；把 B 节移到 C 节之后（移除后第 4 位）
    expect(moveUnit(identity, units, 2, 4)).toEqual([0, 1, 5, 6, 2, 3, 4, 7, 8]);
    // 整节移到末尾
    expect(moveUnit(identity, units, 2, units.length - 1)).toEqual([0, 1, 5, 6, 7, 8, 2, 3, 4]);
  });

  it("from === to 原样返回", () => {
    const units = visibleUnits(rows, new Set());
    expect(moveUnit(identity, units, 2, 2)).toEqual(identity);
  });
});

describe("applyOrder", () => {
  function shuffle(length: number, seed: number) {
    const order = Array.from({ length }, (_, index) => index);
    let state = seed;
    for (let index = length - 1; index > 0; index -= 1) {
      state = (state * 9301 + 49297) % 233280;
      const swap = Math.floor((state / 233280) * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order;
  }

  it("随机排列结果等于期望，撤销一次恢复", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const initial = Array.from({ length: 9 }, (_, index) => paragraph(`P${index}`));
      const editor = createDoc(initial);
      const order = shuffle(initial.length, seed);
      applyOrder(editor, order);
      expect(texts(editor.children)).toEqual(order.map(index => `P${index}`));
      editor.undo();
      expect(texts(editor.children)).toEqual(texts(initial));
    }
  });

  it("恒等排列不做任何操作", () => {
    const editor = createDoc([paragraph("A"), paragraph("B")]);
    applyOrder(editor, [0, 1]);
    expect(editor.operations).toHaveLength(0);
    expect(editor.history.undos).toHaveLength(0);
  });

  it("块数变化或任一顶层块被改动即快照失效", () => {
    const editor = createDoc([paragraph("A"), paragraph("B")]);
    const snapshot = editor.children;
    expect(isSnapshotStale(editor, snapshot)).toBe(false);
    Transforms.insertText(editor, "改", { at: { path: [1, 0], offset: 1 } });
    expect(editor.children).toHaveLength(2);
    expect(isSnapshotStale(editor, snapshot)).toBe(true);
    expect(isSnapshotStale(editor, editor.children)).toBe(false);
    Transforms.insertNodes(editor, paragraph("C"), { at: [2] });
    expect(isSnapshotStale(editor, snapshot)).toBe(true);
  });
});
