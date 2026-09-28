/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  sendSync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);

import Board from "../../Board";
import { BOARD_TO_CONTAINER } from "../../constants";
import type {
  BoardElement,
  ColumnElement,
  IBoardPlugin,
  IElementCapabilities,
  Selection,
  ViewPort,
} from "../../types";
import { ContainmentBehavior, MovementBehavior } from "../../types/capabilities";
import { ColumnUtil, PathUtil } from "../../utils";

const viewPort: ViewPort = {
  minX: 0,
  minY: 0,
  width: 1000,
  height: 800,
  zoom: 1,
};

const createColumn = (id: string, overrides: Partial<ColumnElement> = {}): ColumnElement =>
  ({
    id,
    type: "column",
    x: 0,
    y: 0,
    width: 300,
    height: 500,
    padding: 8,
    gap: 8,
    children: [],
    ...overrides,
  }) as ColumnElement;

const createRichText = (id: string, x: number, y: number): BoardElement => ({
  id,
  type: "richtext",
  x,
  y,
  width: 100,
  height: 40,
  children: [],
});

/** 最小 richtext 插件桩：命中 + 平移 */
const richTextStub: IBoardPlugin = {
  name: "richtext",
  isHit: (_board, element, x, y) =>
    x >= element.x &&
    x <= element.x + element.width &&
    y >= element.y &&
    y <= element.y + element.height,
  moveElement: (_board, element, dx, dy) => ({
    ...element,
    x: (element.x ?? 0) + dx,
    y: (element.y ?? 0) + dy,
  }),
};

/** 与 ColumnPlugin 容器能力等价的桩（复用真实 ColumnUtil 判定） */
const columnStub: IBoardPlugin = {
  name: "column",
  moveElement: (_board, element, dx, dy) => ({
    ...element,
    x: (element.x ?? 0) + dx,
    y: (element.y ?? 0) + dy,
  }),
  isHit: (_board, element, x, y) =>
    x >= element.x &&
    x <= element.x + element.width &&
    y >= element.y &&
    y <= element.y + element.height,
  getCapabilities(): IElementCapabilities {
    return {
      // 与真实 ColumnPlugin 对齐：容器整体移动
      movement: { behavior: MovementBehavior.MoveWithChildren },
      containment: {
        asContainer: ContainmentBehavior.Restricted,
        canBeContained: false,
        canContain: child => child.type === "richtext",
        orderedChildren: true,
        buildChildDragFeedbackOps: (board, container, childId, position) => {
          const path = PathUtil.getPathByElement(board, container);
          if (!path) return [];
          return [
            {
              type: "set_node",
              path,
              properties: {},
              newProperties: {
                draggingChildId: childId,
                draggingPosition: position,
              },
            },
          ];
        },
        buildDragFeedbackOps: (board, container, feedback) => {
          const path = PathUtil.getPathByElement(board, container);
          if (!path) return [];
          const column = container as ColumnElement;
          if (!feedback) {
            if (
              !column.isChildDraggingOver &&
              column.dropIndex === undefined &&
              !column.draggingChildId &&
              !column.draggingPosition
            ) {
              return [];
            }
            return [
              {
                type: "set_node",
                path,
                properties: {},
                newProperties: {
                  isChildDraggingOver: false,
                  dropIndex: undefined,
                  draggingChildId: undefined,
                  draggingPosition: undefined,
                },
              },
            ];
          }
          return [
            {
              type: "set_node",
              path,
              properties: {},
              newProperties: { isChildDraggingOver: feedback.isTarget },
            },
          ];
        },
        isDropFeedbackActive: container =>
          (container as ColumnElement).isChildDraggingOver === true,
        isElementInContainer: (board, container, element, pointerPosition) =>
          ColumnUtil.isElementInColumn(board, element, container as ColumnElement, pointerPosition),
        isChildInContainer: (container, child) =>
          (container as ColumnElement).children.some(c => c.id === child.id),
        getDropIndex: (board, container, dropY, excludeElementId) =>
          ColumnUtil.getDropIndex(board, container as ColumnElement, dropY, excludeElementId),
      },
    };
  },
};

const pointerEvent = (clientX: number, clientY: number) =>
  ({
    button: 0,
    clientX,
    clientY,
    pointerId: 1,
    preventDefault: vi.fn(),
    target: document.body,
  }) as unknown as PointerEvent;

describe("全选拖拽与 Column 容器判定", () => {
  let board: Board;

  const setup = (children: BoardElement[]) => {
    // 模拟 mod+a 全选后的选区（包含容器自身与全部后代）
    const selection: Selection = {
      selectArea: null,
      selectedElements: [...children, ...(children[0]?.children ?? [])],
    };
    board = new Board(children, viewPort, selection, [richTextStub, columnStub]);
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        toJSON: () => ({}),
      }) as DOMRect;
    BOARD_TO_CONTAINER.set(board, container);
    return board;
  };

  afterEach(() => {
    BOARD_TO_CONTAINER.clear();
    board?.destroy();
  });

  it("全选后整体拖动（鼠标全程在 Column 外），根层元素保持位移且不进容器", () => {
    const inColumn = createRichText("in-column", 8, 8);
    const column = createColumn("col", { children: [inColumn] });
    const outside = createRichText("outside", 500, 8);
    setup([column, outside]);

    board.onPointerDown(pointerEvent(550, 28));
    board.onPointerMove(pointerEvent(570, 48));
    board.onPointerUp(pointerEvent(570, 48));

    expect(board.children.map(el => el.id)).toEqual(["col", "outside"]);
    const movedOutside = board.children.find(el => el.id === "outside");
    expect(movedOutside).toMatchObject({ x: 520, y: 28 });
  });

  it("全选后从 Column 内部元素开始拖动，根层元素不应被吸入 Column", () => {
    const inColumn = createRichText("in-column", 8, 8);
    const column = createColumn("col", { children: [inColumn] });
    const outside = createRichText("outside", 500, 8);
    setup([column, outside]);

    // 从 Column 内的元素开始拖动：鼠标相对同步移动的 Column 恒在内容区内
    board.onPointerDown(pointerEvent(100, 20));
    board.onPointerMove(pointerEvent(120, 40));
    board.onPointerUp(pointerEvent(120, 40));

    expect(board.children.map(el => el.id)).toEqual(["col", "outside"]);
  });

  it("仅拖动单个根层元素到 Column 内（非全选），应正常进入容器", () => {
    const inColumn = createRichText("in-column", 8, 8);
    const column = createColumn("col", { children: [inColumn] });
    const outside = createRichText("outside", 500, 8);
    setup([column, outside]);
    // 非全选：只选中 outside
    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectedElements: [outside] },
      },
      false
    );

    board.onPointerDown(pointerEvent(550, 28));
    board.onPointerMove(pointerEvent(150, 80));
    board.onPointerUp(pointerEvent(150, 80));

    const latestColumn = board.children.find(el => el.id === "col") as ColumnElement;
    expect(latestColumn.children.map(c => c.id)).toContain("outside");
  });
});
