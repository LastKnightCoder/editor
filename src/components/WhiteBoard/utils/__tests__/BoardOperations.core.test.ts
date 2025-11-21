import { performance } from "node:perf_hooks";
import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import { BoardElement, Operation } from "../../types";

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

const apply = (
  children: BoardElement[],
  operations: Operation[],
  options?: Parameters<typeof BoardOperations.applyOperations>[2],
) =>
  BoardOperations.applyOperations(
    { children: JSON.parse(JSON.stringify(children)) },
    operations,
    {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
      ...options,
    },
  );

describe("BoardOperations - 基础操作", () => {
  it("insert_node 在根级别插入元素", () => {
    const base = [createRect("a"), createRect("b")];
    const operations: Operation[] = [
      {
        type: "insert_node",
        path: [1],
        node: createRect("x"),
      },
    ];

    const result = apply(base, operations);
    expect(result.data.children.map((el) => el.id)).toEqual(["a", "x", "b"]);
  });

  it("remove_node 会记录 metadata 并删除元素", () => {
    const base = [createRect("a"), createRect("b")];
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0],
        node: base[0],
      },
    ];

    const result = apply(base, operations);
    expect(result.data.children.map((el) => el.id)).toEqual(["b"]);
    expect(result.metadata.removedElements.map((el) => el.id)).toEqual(["a"]);
  });

  it("move_node 在根层改变顺序", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];
    const operations: Operation[] = [
      { type: "move_node", path: [0], newPath: [2] },
    ];

    const result = apply(base, operations);
    expect(result.data.children.map((el) => el.id)).toEqual(["b", "c", "a"]);
  });

  it("set_node 更新属性并影响 metadata", () => {
    const base = [createRect("a")];
    const operations: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: { x: 0, y: 0 },
        newProperties: { x: 20, y: 30 },
      },
    ];

    const result = apply(base, operations);
    expect(result.data.children[0].x).toBe(20);
    expect(result.metadata.changedElements[0].id).toBe("a");
  });
});

describe("BoardOperations - 选项与元数据", () => {
  it("readonly 模式不会应用任何操作", () => {
    const base = [createRect("a")];
    const operations: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 999 },
      },
    ];

    const result = apply(base, operations, { readonly: true });
    expect(result.data.children[0].x).toBe(0);
    expect(result.metadata.hasChanges).toBe(false);
  });

  it("能够跳过 selection / viewport 操作", () => {
    const selection = { selectedElements: [], selectArea: null };
    const viewPort = { x: 0, y: 0, width: 100, height: 100, zoom: 1 } as any;
    const operations: Operation[] = [
      {
        type: "set_selection",
        properties: selection,
        newProperties: { selectedElements: [createRect("ref")] },
      },
      {
        type: "set_viewport",
        properties: viewPort,
        newProperties: { zoom: 2 },
      },
    ];

    const result = BoardOperations.applyOperations(
      { children: [], selection, viewPort },
      operations,
      { skipSelectionOperations: true, skipViewPortOperations: true },
    );

    expect(result.metadata.hasChanges).toBe(false);
    expect(result.operations).toHaveLength(0);
  });

  it("无效路径的操作会被忽略且不抛错", () => {
    const base = [createRect("a")];
    const operations: Operation[] = [
      {
        type: "set_node",
        path: [99],
        properties: { x: 0 },
        newProperties: { x: 1 },
      },
      {
        type: "remove_node",
        path: [99],
        node: createRect("ghost"),
      },
    ];

    const result = apply(base, operations);
    expect(result.data.children).toEqual(base);
    expect(result.operations).toHaveLength(0);
  });
});

describe("BoardOperations - 路径与性能", () => {
  it("标记 normalized 操作不会再次变换路径", () => {
    const base = [createRect("a"), createRect("b")];
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0],
        node: base[0],
      },
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 77 },
      },
    ];
    operations.forEach((op) => BoardOperations.markAsNormalized(op));

    const result = BoardOperations.applyOperations(
      { children: base },
      operations,
    );
    expect(result.data.children[0].x).toBe(77);
    result.operations.forEach((op) => {
      expect(BoardOperations.isNormalizedOperation(op)).toBe(true);
    });
  });

  it("move_node 之后的 set_node 会使用调整后的路径", () => {
    const child = createRect("child");
    const base: BoardElement[] = [
      {
        ...createRect("parent"),
        children: [child],
      },
      createRect("anchor"),
    ];

    const operations: Operation[] = [
      { type: "move_node", path: [0, 0], newPath: [1] },
      {
        type: "set_node",
        path: [0, 0],
        properties: { x: child.x },
        newProperties: { x: 500 },
      },
    ];

    const result = apply(base, operations);
    expect(result.data.children.map((el) => el.id)).toEqual([
      "parent",
      "child",
      "anchor",
    ]);
    expect(result.data.children[1].x).toBe(500);
  });

  it("大数据量 set_node 性能测试", () => {
    const elementCount = 1000;
    const base: BoardElement[] = Array.from({ length: elementCount }, (_, i) =>
      createRect(`node-${i}`, { x: i }),
    );

    const operations: Operation[] = base.map(
      (element, index): Operation => ({
        type: "set_node",
        path: [index],
        properties: { x: element.x },
        newProperties: { x: element.x + 100 },
      }),
    );

    const start = performance.now();
    const result = apply(base, operations);
    const duration = performance.now() - start;

    expect(
      result.data.children.every((node, idx) => node.x === idx + 100),
    ).toBe(true);
    expect(duration).toBeLessThan(250);
  });
});
