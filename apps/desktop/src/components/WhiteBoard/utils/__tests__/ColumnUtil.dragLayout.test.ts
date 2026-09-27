import { describe, expect, it, vi } from "vitest";
import { ColumnUtil } from "../ColumnUtil";
import { COLUMN_DEFAULTS } from "../../types/column";
import type { Board, BoardElement, ColumnElement } from "../../types";

const { titleHeight: TITLE, padding: PAD, gap: GAP } = COLUMN_DEFAULTS;
const TOP = TITLE + PAD;

const card = (id: string, height: number): BoardElement =>
  ({ id, type: "richtext", x: PAD, y: 0, width: 284, height }) as BoardElement;

/** 三张卡片 A(40) B(60) C(20)，已按规范布局 */
const createColumn = (overrides: Partial<ColumnElement> = {}): ColumnElement =>
  ColumnUtil.layout(
    {} as Board,
    {
      id: "col",
      type: "column",
      x: 0,
      y: 0,
      width: 300,
      height: 0,
      title: "",
      padding: PAD,
      gap: GAP,
      minWidth: 200,
      maxWidth: 600,
      children: [card("a", 40), card("b", 60), card("c", 20)],
      ...overrides,
    } as ColumnElement
  );

const boardStub = {
  getBounds: (el: BoardElement) => ({
    minX: el.x,
    minY: el.y,
    maxX: el.x + el.width,
    maxY: el.y + el.height,
  }),
} as unknown as Board;

describe("ColumnUtil.getVisualLayout", () => {
  it("无拖拽时与存储布局一致", () => {
    const column = createColumn();
    const layout = ColumnUtil.getVisualLayout(column);
    column.children.forEach(child => {
      expect(layout.childYs.get(child.id)).toBe(child.y);
    });
    expect(layout.placeholderY).toBeNull();
    expect(layout.height).toBe(ColumnUtil.calculateHeightFromChildren(column));
  });

  it("外部元素拖入：落点处空出占位块，后续元素下移，托盘变高", () => {
    const base = createColumn();
    const column = { ...base, isChildDraggingOver: true, dropIndex: 1, dropPlaceholderHeight: 30 };
    const layout = ColumnUtil.getVisualLayout(column);

    expect(layout.childYs.get("a")).toBe(TOP);
    expect(layout.placeholderY).toBe(TOP + 40 + GAP);
    expect(layout.childYs.get("b")).toBe(TOP + 40 + GAP + 30 + GAP);
    expect(layout.height).toBe(ColumnUtil.calculateHeightFromChildren(base) + 30 + GAP);
    expect(layout.height - ColumnUtil.calculateHeightFromChildren(base)).toBe(
      ColumnUtil.getDropGrowth(column)
    );
  });

  it("列内拖拽：原位合拢，占位块移到落点，托盘总高不变", () => {
    const base = createColumn();
    // 把 A 拖到 B、C 之间（dropIndex 按移动前的完整数组计）
    const column = {
      ...base,
      isChildDraggingOver: true,
      draggingChildId: "a",
      dropIndex: 2,
      dropPlaceholderHeight: 40,
    };
    const layout = ColumnUtil.getVisualLayout(column);

    expect(layout.childYs.has("a")).toBe(false);
    expect(layout.childYs.get("b")).toBe(TOP);
    expect(layout.placeholderY).toBe(TOP + 60 + GAP);
    expect(layout.childYs.get("c")).toBe(TOP + 60 + GAP + 40 + GAP);
    expect(layout.height).toBe(ColumnUtil.calculateHeightFromChildren(base));
    expect(ColumnUtil.getDropGrowth(column)).toBe(0);
  });

  it("列内元素拖到列外：原位合拢、无占位块，托盘变矮", () => {
    const base = createColumn();
    const column = { ...base, draggingChildId: "b", draggingPosition: { x: 500, y: 0 } };
    const layout = ColumnUtil.getVisualLayout(column);

    expect(layout.placeholderY).toBeNull();
    expect(layout.childYs.get("c")).toBe(TOP + 40 + GAP);
    expect(layout.height).toBe(ColumnUtil.calculateHeightFromChildren(base) - 60 - GAP);
  });

  it("唯一子元素被拖出后视觉上为空列", () => {
    const base = createColumn({ children: [card("a", 40)] });
    const layout = ColumnUtil.getVisualLayout({ ...base, draggingChildId: "a" });
    expect(layout.isVisuallyEmpty).toBe(true);
    expect(layout.height).toBe(TITLE + PAD * 2 + COLUMN_DEFAULTS.emptyHeight);
  });

  it("空列拖入：占位块位于内容区顶部", () => {
    const base = createColumn({ children: [] });
    const column = { ...base, isChildDraggingOver: true, dropIndex: 0, dropPlaceholderHeight: 50 };
    const layout = ColumnUtil.getVisualLayout(column);
    expect(layout.isVisuallyEmpty).toBe(false);
    expect(layout.placeholderY).toBe(TOP);
    expect(layout.height).toBe(TOP + 50 + PAD);
  });
});

describe("ColumnUtil.getDropIndex", () => {
  it("外部元素按各卡片中线决定插入位置", () => {
    const column = createColumn();
    expect(ColumnUtil.getDropIndex(boardStub, column, TOP + 10)).toBe(0);
    expect(ColumnUtil.getDropIndex(boardStub, column, TOP + 30)).toBe(1);
    expect(ColumnUtil.getDropIndex(boardStub, column, 1000)).toBe(3);
  });

  it("列内拖拽按合拢后的布局判定，与视觉位置一致", () => {
    const column = createColumn();
    // 合拢 A 后 B 占 [TOP, TOP+60]，中线 TOP+30
    expect(ColumnUtil.getDropIndex(boardStub, column, TOP + 20, "a")).toBe(0);
    expect(ColumnUtil.getDropIndex(boardStub, column, TOP + 40, "a")).toBe(2);
  });
});

describe("ColumnUtil.getPlaceholderHeight", () => {
  it("列内元素取自身高度", () => {
    const column = createColumn();
    expect(ColumnUtil.getPlaceholderHeight(column, column.children[1])).toBe(60);
  });

  it("外部图片按列内容宽度与宽高比估算", () => {
    const column = createColumn();
    const image = {
      id: "img",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      naturalWidth: 400,
      naturalHeight: 200,
    } as BoardElement;
    expect(ColumnUtil.getPlaceholderHeight(column, image)).toBe((300 - PAD * 2) / 2);
  });

  it("外部其他元素限制在范围内", () => {
    const column = createColumn();
    expect(ColumnUtil.getPlaceholderHeight(column, card("tiny", 10))).toBe(
      COLUMN_DEFAULTS.placeholderMinHeight
    );
    expect(ColumnUtil.getPlaceholderHeight(column, card("huge", 900))).toBe(
      COLUMN_DEFAULTS.placeholderMaxHeight
    );
  });
});

describe("ColumnUtil.getCountLabel", () => {
  const typed = (id: string, type: string) => ({ ...card(id, 40), type }) as BoardElement;

  it("空列", () => {
    expect(ColumnUtil.getCountLabel(createColumn({ children: [] }))).toBe("空");
  });

  it("同类元素使用对应量词", () => {
    expect(ColumnUtil.getCountLabel(createColumn())).toBe("3 段文字");
    expect(
      ColumnUtil.getCountLabel(
        createColumn({ children: [typed("i1", "image"), typed("i2", "image")] })
      )
    ).toBe("2 张图片");
  });

  it("混合类型统称元素", () => {
    expect(
      ColumnUtil.getCountLabel(createColumn({ children: [typed("i1", "image"), card("t1", 40)] }))
    ).toBe("2 个元素");
  });
});

describe("Column 折叠", () => {
  it("折叠态高度为标题栏 + 纸边，空列无纸边", () => {
    const column = createColumn({ collapsed: true });
    expect(ColumnUtil.calculateHeightFromChildren(column)).toBe(
      TITLE + COLUMN_DEFAULTS.collapsedStackHeight
    );
    expect(column.height).toBe(TITLE + COLUMN_DEFAULTS.collapsedStackHeight);
    expect(
      ColumnUtil.calculateHeightFromChildren(createColumn({ collapsed: true, children: [] }))
    ).toBe(TITLE);
  });

  it("折叠态视觉布局无占位、不显示空列，子元素保持存储位置", () => {
    const base = createColumn({ collapsed: true });
    const layout = ColumnUtil.getVisualLayout({
      ...base,
      isChildDraggingOver: true,
      dropIndex: 0,
      dropPlaceholderHeight: 40,
    });
    expect(layout.placeholderY).toBeNull();
    expect(layout.isVisuallyEmpty).toBe(false);
    expect(layout.height).toBe(ColumnUtil.calculateHeightFromChildren(base));
    base.children.forEach(child => expect(layout.childYs.get(child.id)).toBe(child.y));
  });

  it("折叠的列不接受拖入", () => {
    const column = createColumn({ collapsed: true });
    const inside = { x: 10, y: 10 };
    expect(ColumnUtil.isElementInColumn(boardStub, card("x", 40), column, inside)).toBe(false);
    expect(
      ColumnUtil.isElementInColumn(
        boardStub,
        card("x", 40),
        { ...column, collapsed: false },
        inside
      )
    ).toBe(true);
  });

  it("切换折叠与重新布局合并为一次带历史的操作", () => {
    const column = createColumn();
    const apply = vi.fn();
    const board = { ...boardStub, children: [column], apply } as unknown as Board;

    ColumnUtil.toggleCollapsed(board, column);

    expect(apply).toHaveBeenCalledTimes(1);
    const [ops, updateHistory] = apply.mock.calls[0];
    expect(updateHistory).toBe(true);
    const patch = Object.assign(
      {},
      ...ops.map((op: { newProperties?: object }) => op.newProperties)
    );
    expect(patch).toMatchObject({
      collapsed: true,
      height: TITLE + COLUMN_DEFAULTS.collapsedStackHeight,
    });
  });
});
