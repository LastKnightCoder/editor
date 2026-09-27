import { describe, expect, it, vi } from "vitest";
import Board from "../../Board";
import { BoardElement, Selection } from "../../types";
import BoardUtil from "../BoardUtil";

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 80,
  height: 60,
  ...overrides,
});

const createDefaultBounds = (element: BoardElement) => {
  if (
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    typeof element.width === "number" &&
    typeof element.height === "number"
  ) {
    return {
      minX: Math.min(element.x, element.x + element.width),
      minY: Math.min(element.y, element.y + element.height),
      maxX: Math.max(element.x, element.x + element.width),
      maxY: Math.max(element.y, element.y + element.height),
    };
  }
  return null;
};

const defaultPointHit = (element: BoardElement, x: number, y: number) => {
  const bounds = createDefaultBounds(element);
  if (!bounds) return false;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
};

const defaultRectHit = (element: BoardElement, selectArea: Selection["selectArea"]) => {
  if (!selectArea) return false;
  const bounds = createDefaultBounds(element);
  if (!bounds) return false;
  const minX = Math.min(selectArea.anchor.x, selectArea.focus.x);
  const minY = Math.min(selectArea.anchor.y, selectArea.focus.y);
  const maxX = Math.max(selectArea.anchor.x, selectArea.focus.x);
  const maxY = Math.max(selectArea.anchor.y, selectArea.focus.y);
  return !(bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY);
};

const collectByDfs = (
  elements: BoardElement[],
  predicate: (element: BoardElement) => boolean
): BoardElement[] => {
  const result: BoardElement[] = [];
  const walk = (nodes: BoardElement[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (predicate(node)) {
        result.push(node);
      }
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(elements);
  return result;
};

const createBoardContext = (
  children: BoardElement[],
  overrides?: {
    isHit?: (element: BoardElement, x: number, y: number) => boolean;
    isElementSelected?: (element: BoardElement, selectArea: Selection["selectArea"]) => boolean;
    getBounds?: (element: BoardElement) => ReturnType<typeof createDefaultBounds>;
  }
) => {
  let version = 0;
  const isHitMock = vi.fn(
    overrides?.isHit ??
      ((element: BoardElement, x: number, y: number) => defaultPointHit(element, x, y))
  );
  const isElementSelectedMock = vi.fn(
    overrides?.isElementSelected ??
      ((element: BoardElement, selectArea: Selection["selectArea"]) =>
        defaultRectHit(element, selectArea))
  );
  const getBoundsMock = vi.fn(
    overrides?.getBounds ?? ((element: BoardElement) => createDefaultBounds(element))
  );

  const board = {
    boardFlag: Board.boardFlag,
    children,
    getElementVersion: () => version,
    isHit: isHitMock,
    isElementSelected: isElementSelectedMock,
    getBounds: getBoundsMock,
  } as unknown as Board;

  return {
    board,
    isHitMock,
    isElementSelectedMock,
    setElementVersion: (next: number) => {
      version = next;
    },
  };
};

describe("BoardUtil 命中索引", () => {
  it("点命中顺序与 DFS 保持一致", () => {
    const elements: BoardElement[] = [
      createRect("a", { x: 0, y: 0, width: 200, height: 200 }),
      {
        ...createRect("container", { x: 0, y: 0, width: 200, height: 200 }),
        children: [
          createRect("child-1", { x: 0, y: 0, width: 200, height: 200 }),
          createRect("child-2", { x: 0, y: 0, width: 200, height: 200 }),
        ],
      },
      createRect("b", { x: 0, y: 0, width: 200, height: 200 }),
    ];
    const { board } = createBoardContext(elements);

    const expected = collectByDfs(elements, element => defaultPointHit(element, 20, 20)).map(
      element => element.id
    );
    const actual = BoardUtil.getHitElements(board, 20, 20).map(element => element.id);

    expect(actual).toEqual(expected);
  });

  it("框选结果与 DFS 保持一致", () => {
    const elements: BoardElement[] = [
      createRect("a", { x: 0, y: 0, width: 80, height: 80 }),
      createRect("b", { x: 200, y: 200, width: 60, height: 60 }),
      createRect("c", { x: 50, y: 50, width: 120, height: 120 }),
    ];
    const { board } = createBoardContext(elements);
    const selectArea: Selection["selectArea"] = {
      anchor: { x: 10, y: 10 },
      focus: { x: 140, y: 140 },
    };

    const expected = collectByDfs(elements, element => defaultRectHit(element, selectArea)).map(
      element => element.id
    );
    const actual = BoardUtil.getElementsInSelectArea(board, selectArea).map(element => element.id);

    expect(actual).toEqual(expected);
  });

  it("元素版本变化后会重建索引", () => {
    const elements: BoardElement[] = [createRect("move", { x: 0, y: 0 })];
    const { board, setElementVersion } = createBoardContext(elements);

    expect(BoardUtil.getHitElements(board, 10, 10).map(el => el.id)).toEqual(["move"]);

    elements[0].x = 200;
    setElementVersion(1);

    expect(BoardUtil.getHitElements(board, 10, 10)).toHaveLength(0);
    expect(BoardUtil.getHitElements(board, 210, 10).map(el => el.id)).toEqual(["move"]);
  });

  it("无包围盒元素仍会通过回退路径参与命中", () => {
    const elements: BoardElement[] = [
      createRect("a", { x: 0, y: 0, width: 80, height: 80 }),
      { id: "path-only", type: "path-only" },
    ];
    const { board } = createBoardContext(elements, {
      isHit: element => element.id === "path-only",
      getBounds: element => {
        if (element.id === "path-only") return null;
        return createDefaultBounds(element);
      },
    });

    const hitIds = BoardUtil.getHitElements(board, 999, 999).map(element => element.id);

    expect(hitIds).toEqual(["path-only"]);
  });

  it("大量元素下会显著减少 isHit 调用次数", () => {
    const elements: BoardElement[] = Array.from({ length: 4000 }, (_, index) =>
      createRect(`rect-${index}`, {
        x: (index % 100) * 20,
        y: Math.floor(index / 100) * 20,
        width: 12,
        height: 12,
      })
    );
    const { board, isHitMock } = createBoardContext(elements);

    isHitMock.mockClear();
    const hitIds = BoardUtil.getHitElements(board, 45, 45).map(element => element.id);

    expect(hitIds.length).toBeGreaterThan(0);
    expect(isHitMock.mock.calls.length).toBeLessThan(elements.length / 8);
  });

  it("render 能力过滤掉的子元素（如折叠）不参与命中与框选", () => {
    const elements: BoardElement[] = [
      {
        ...createRect("column", { x: 0, y: 0, width: 200, height: 200 }),
        collapsed: true,
        children: [createRect("hidden-child", { x: 0, y: 0, width: 200, height: 200 })],
      },
    ];
    const { board } = createBoardContext(elements);
    (board as unknown as { capabilityService: unknown }).capabilityService = {
      getVisibleChildren: (element: BoardElement, children: BoardElement[]) =>
        element.collapsed ? [] : children,
    };

    expect(BoardUtil.getHitElements(board, 20, 20).map(el => el.id)).toEqual(["column"]);
    expect(
      BoardUtil.getElementsInSelectArea(board, {
        anchor: { x: -10, y: -10 },
        focus: { x: 300, y: 300 },
      }).map(el => el.id)
    ).toEqual(["column"]);
  });
});
