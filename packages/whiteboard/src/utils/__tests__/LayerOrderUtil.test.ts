import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Board, BoardElement, Operation } from "../../types";
import BoardOperations from "../BoardOperations";
import BoardUtil from "../BoardUtil";
import { executeLayerOrderAction, getLayerOrderActionState } from "../LayerOrderUtil";

const createElement = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "geometry",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  ...overrides,
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

beforeAll(() => {
  vi.spyOn(BoardUtil, "isBoard").mockImplementation((value: unknown) => {
    return Boolean(value && (value as any).children && !(value as any).id);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

const createBoardMock = (
  children: BoardElement[],
  options?: {
    shouldReverseChildren?: (element: BoardElement) => boolean;
    requiresRelayout?: (element: BoardElement) => boolean;
  }
): Board => {
  const board = {
    children: clone(children),
    capabilityService: {
      shouldReverseChildren: options?.shouldReverseChildren ?? (() => true),
      requiresRelayout: options?.requiresRelayout ?? (() => false),
    },
    apply: vi.fn((ops: Operation[] | Operation) => {
      const list = Array.isArray(ops) ? ops : [ops];
      board.children = BoardOperations.applyToChildren(board.children, list);
    }),
  } as unknown as Board;

  return board;
};

const getRootOrder = (board: Board) => board.children.map(item => item.id);

describe("LayerOrderUtil", () => {
  it("逆序场景下上移一层应向视觉顶层移动", () => {
    const board = createBoardMock([
      createElement("a"),
      createElement("b"),
      createElement("c"),
      createElement("d"),
    ]);

    const target = board.children[1];
    const changed = executeLayerOrderAction(board, [target], "move-up");

    expect(changed).toBe(true);
    expect(getRootOrder(board)).toEqual(["a", "c", "b", "d"]);
  });

  it("正序父级场景下下移一层应向视觉底层移动", () => {
    const board = createBoardMock(
      [
        createElement("container", {
          type: "column",
          children: [
            createElement("a"),
            createElement("b"),
            createElement("c"),
            createElement("d"),
          ],
        }),
      ],
      {
        shouldReverseChildren: element => element.type !== "column",
      }
    );

    const container = board.children[0];
    const target = container.children![1];
    const changed = executeLayerOrderAction(board, [target], "move-down");

    expect(changed).toBe(true);
    expect(board.children[0].children?.map(item => item.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("同父级批量移至顶层应保持相对顺序", () => {
    const board = createBoardMock([
      createElement("a"),
      createElement("b"),
      createElement("c"),
      createElement("d"),
      createElement("e"),
    ]);

    const targets = [board.children[1], board.children[2]];
    const changed = executeLayerOrderAction(board, targets, "move-top");

    expect(changed).toBe(true);
    expect(getRootOrder(board)).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("跨父级多选时四个动作都应禁用", () => {
    const board = createBoardMock([
      createElement("a"),
      createElement("frame", {
        type: "frame",
        children: [createElement("c1"), createElement("c2")],
      }),
      createElement("b"),
    ]);

    const state = getLayerOrderActionState(board, [
      board.children[0],
      board.children[1].children![0],
    ]);

    expect(state.moveUpDisabled).toBe(true);
    expect(state.moveDownDisabled).toBe(true);
    expect(state.moveTopDisabled).toBe(true);
    expect(state.moveBottomDisabled).toBe(true);
  });

  it("边界元素应禁用对应方向动作", () => {
    const board = createBoardMock([
      createElement("a"),
      createElement("b"),
      createElement("c"),
      createElement("d"),
    ]);

    const topMostInVisual = board.children[3];
    const bottomMostInVisual = board.children[0];

    const topState = getLayerOrderActionState(board, [topMostInVisual]);
    expect(topState.moveUpDisabled).toBe(true);
    expect(topState.moveDownDisabled).toBe(false);

    const bottomState = getLayerOrderActionState(board, [bottomMostInVisual]);
    expect(bottomState.moveDownDisabled).toBe(true);
    expect(bottomState.moveUpDisabled).toBe(false);
  });
});
