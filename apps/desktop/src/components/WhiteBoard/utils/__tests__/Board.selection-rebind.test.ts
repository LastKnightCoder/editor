import { describe, expect, it } from "vitest";
import Board from "../../Board";
import type { BoardElement, Operation } from "../../types";

const createRect = (
  id: string,
  overrides: Partial<BoardElement> = {},
): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  ...overrides,
});

describe("Board.apply - Selection Rebind", () => {
  it("apply 后 selection.selectedElements 应引用最新 children 树上的对象（避免陈旧快照回写位置）", () => {
    const a = createRect("a");
    const b = createRect("b", { x: 200 });

    const board = new Board(
      [a, b],
      { x: 0, y: 0, width: 1000, height: 800, zoom: 1 } as any,
      { selectedElements: [a], selectArea: null } as any,
      [],
      [],
    );

    board.apply(
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 10 },
      } as Operation,
      false,
    );

    // BoardOperations 会对 children 做深拷贝；因此 a 的引用会变。
    expect(board.children[0]).not.toBe(a);

    // selection 必须重新绑定到最新 children 上，否则后续 setter 会把旧 x/y 写回去。
    expect(board.selection.selectedElements).toHaveLength(1);
    expect(board.selection.selectedElements[0].id).toBe("a");
    expect(board.selection.selectedElements[0]).toBe(board.children[0]);
    expect(board.selection.selectedElements[0]).not.toBe(a);
  });
});
