import { describe, expect, it, vi } from "vitest";
import Board from "../../Board";
import type { BoardElement, Operation } from "../../types";

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
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
      []
    );

    board.apply(
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 10 },
      } as Operation,
      false
    );

    // BoardOperations 在节点变更时会生成新的 children 树；因此 a 的引用会变。
    expect(board.children[0]).not.toBe(a);

    // selection 必须重新绑定到最新 children 上，否则后续 setter 会把旧 x/y 写回去。
    expect(board.selection.selectedElements).toHaveLength(1);
    expect(board.selection.selectedElements[0].id).toBe("a");
    expect(board.selection.selectedElements[0]).toBe(board.children[0]);
    expect(board.selection.selectedElements[0]).not.toBe(a);
  });

  it("仅 set_selection 时不应替换 children 引用", () => {
    const a = createRect("a");
    const b = createRect("b", { x: 200 });

    const board = new Board(
      [a, b],
      { x: 0, y: 0, width: 1000, height: 800, zoom: 1 } as any,
      { selectedElements: [], selectArea: null } as any,
      [],
      []
    );

    const beforeChildren = board.children;
    const beforeFirstChild = board.children[0];

    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectArea: null, selectedElements: [a] },
      } as Operation,
      false
    );

    expect(board.children).toBe(beforeChildren);
    expect(board.children[0]).toBe(beforeFirstChild);
  });

  it("仅 set_viewport 时不应改写 selection.selectedElements 引用", () => {
    const a = createRect("a");
    const board = new Board(
      [a],
      { x: 0, y: 0, width: 1000, height: 800, zoom: 1 } as any,
      { selectedElements: [a], selectArea: null } as any,
      [],
      []
    );

    const beforeSelectedElements = board.selection.selectedElements;

    board.apply(
      {
        type: "set_viewport",
        properties: board.viewPort,
        newProperties: { ...board.viewPort, zoom: 2 },
      } as Operation,
      false
    );

    expect(board.selection.selectedElements).toBe(beforeSelectedElements);
    expect(board.selection.selectedElements[0]).toBe(a);
  });

  it("set_node 应触发 value:change 与 change，并在选中元素重绑时触发 selection:change", () => {
    const a = createRect("a");
    const board = new Board(
      [a],
      { x: 0, y: 0, width: 1000, height: 800, zoom: 1 } as any,
      { selectedElements: [a], selectArea: null } as any,
      [],
      []
    );

    const onValueChangeEvent = vi.fn();
    const onSelectionChangeEvent = vi.fn();
    const onViewPortChangeEvent = vi.fn();
    const onChange = vi.fn();

    board.on("value:change", onValueChangeEvent);
    board.on("selection:change", onSelectionChangeEvent);
    board.on("viewport:change", onViewPortChangeEvent);
    board.on("change", onChange);

    board.apply(
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 10 },
      } as Operation,
      false
    );

    expect(onValueChangeEvent).toHaveBeenCalledTimes(1);
    expect(onSelectionChangeEvent).toHaveBeenCalledTimes(1);
    expect(onViewPortChangeEvent).toHaveBeenCalledTimes(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("仅 set_viewport 时只触发 onViewPortChangeEvent 与 change", () => {
    const a = createRect("a");
    const board = new Board(
      [a],
      { x: 0, y: 0, width: 1000, height: 800, zoom: 1 } as any,
      { selectedElements: [a], selectArea: null } as any,
      [],
      []
    );

    const onValueChangeEvent = vi.fn();
    const onSelectionChangeEvent = vi.fn();
    const onViewPortChangeEvent = vi.fn();
    const onChange = vi.fn();

    board.on("value:change", onValueChangeEvent);
    board.on("selection:change", onSelectionChangeEvent);
    board.on("viewport:change", onViewPortChangeEvent);
    board.on("change", onChange);

    board.apply(
      {
        type: "set_viewport",
        properties: board.viewPort,
        newProperties: { ...board.viewPort, zoom: 2 },
      } as Operation,
      false
    );

    expect(onValueChangeEvent).toHaveBeenCalledTimes(0);
    expect(onSelectionChangeEvent).toHaveBeenCalledTimes(0);
    expect(onViewPortChangeEvent).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("无效路径操作不应触发 change/onValueChangeEvent/onSelectionChangeEvent", () => {
    const a = createRect("a");
    const board = new Board(
      [a],
      { x: 0, y: 0, width: 1000, height: 800, zoom: 1 } as any,
      { selectedElements: [a], selectArea: null } as any,
      [],
      []
    );

    const onValueChangeEvent = vi.fn();
    const onSelectionChangeEvent = vi.fn();
    const onChange = vi.fn();

    board.on("value:change", onValueChangeEvent);
    board.on("selection:change", onSelectionChangeEvent);
    board.on("change", onChange);

    board.apply(
      {
        type: "set_node",
        path: [99],
        properties: { x: 0 },
        newProperties: { x: 10 },
      } as Operation,
      false
    );

    expect(onValueChangeEvent).toHaveBeenCalledTimes(0);
    expect(onSelectionChangeEvent).toHaveBeenCalledTimes(0);
    expect(onChange).toHaveBeenCalledTimes(0);
  });
});
