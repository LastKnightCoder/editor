import { performance } from "node:perf_hooks";
import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import { BoardElement, Operation } from "../../types";

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  ...overrides,
});

const deepFreeze = <T>(value: T): T => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    value.forEach(item => deepFreeze(item));
  } else {
    Object.values(value as Record<string, unknown>).forEach(item => deepFreeze(item));
  }

  return Object.freeze(value);
};

const apply = (
  children: BoardElement[],
  operations: Operation[],
  options?: Parameters<typeof BoardOperations.applyOperations>[2]
) =>
  BoardOperations.applyOperations({ children: JSON.parse(JSON.stringify(children)) }, operations, {
    skipSelectionOperations: true,
    skipViewPortOperations: true,
    ...options,
  });

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
    expect(result.data.children.map(el => el.id)).toEqual(["a", "x", "b"]);
    expect(result.metadata.insertedElements.map(el => el.id)).toEqual(["x"]);
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
    expect(result.data.children.map(el => el.id)).toEqual(["b"]);
    expect(result.metadata.removedElements.map(el => el.id)).toEqual(["a"]);
  });

  it("move_node 在根层改变顺序", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];
    const operations: Operation[] = [{ type: "move_node", path: [0], newPath: [2] }];

    const result = apply(base, operations);
    // move_node 的 newPath 基于“移动前”的路径：当从较小 index 移动到较大 index 时，最终插入 index 会自动 -1
    expect(result.data.children.map(el => el.id)).toEqual(["b", "a", "c"]);
  });

  it("move_node 在嵌套容器内向下移动时使用移动前快照路径", () => {
    const column = createRect("column", {
      type: "column",
      children: [createRect("a"), createRect("b"), createRect("c")],
    });
    const operations: Operation[] = [{ type: "move_node", path: [0, 0], newPath: [0, 2] }];

    const result = apply([column], operations);
    expect(result.data.children[0].children?.map(el => el.id)).toEqual(["b", "a", "c"]);
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
  it("仅 selection 变更时应复用 children 引用", () => {
    const children = [createRect("a")];
    const selection = { selectedElements: [], selectArea: null } as any;
    const operations: Operation[] = [
      {
        type: "set_selection",
        properties: selection,
        newProperties: { selectedElements: [createRect("ref")] },
      },
    ];

    const result = BoardOperations.applyOperations({ children, selection }, operations, {
      skipViewPortOperations: true,
    });

    expect(result.metadata.hasChanges).toBe(true);
    expect(result.data.children).toBe(children);
    expect(result.data.selection).not.toBe(selection);
  });

  it("仅 viewport 变更时应复用 children 与 selection 引用", () => {
    const children = [createRect("a")];
    const selection = {
      selectedElements: [children[0]],
      selectArea: null,
    } as any;
    const viewPort = { x: 0, y: 0, width: 100, height: 100, zoom: 1 } as any;
    const operations: Operation[] = [
      {
        type: "set_viewport",
        properties: viewPort,
        newProperties: { zoom: 2 },
      },
    ];

    const result = BoardOperations.applyOperations({ children, selection, viewPort }, operations, {
      skipSelectionOperations: true,
    });

    expect(result.metadata.hasChanges).toBe(true);
    expect(result.data.children).toBe(children);
    expect(result.data.selection).toBe(selection);
    expect(result.data.viewPort).not.toBe(viewPort);
  });

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
      { skipSelectionOperations: true, skipViewPortOperations: true }
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

describe("BoardOperations - 冻结输入兼容", () => {
  it("set_node 在冻结 children 上仍可执行且不污染原数据", () => {
    const frozenChildren = deepFreeze([createRect("a", { x: 1 })]);
    const operations: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: { x: 1 },
        newProperties: { x: 999 },
      },
    ];

    const result = BoardOperations.applyOperations({ children: frozenChildren }, operations, {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
    });

    expect(result.data.children[0].x).toBe(999);
    expect(frozenChildren[0].x).toBe(1);
  });

  it("insert_node 在冻结 children 上仍可执行且不污染原数据", () => {
    const frozenChildren = deepFreeze([createRect("a")]);
    const operations: Operation[] = [
      {
        type: "insert_node",
        path: [1],
        node: createRect("b"),
      },
    ];

    const result = BoardOperations.applyOperations({ children: frozenChildren }, operations, {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
    });

    expect(result.data.children.map(el => el.id)).toEqual(["a", "b"]);
    expect(frozenChildren.map(el => el.id)).toEqual(["a"]);
  });

  it("remove_node 在冻结 children 上仍可执行且不污染原数据", () => {
    const frozenChildren = deepFreeze([createRect("a"), createRect("b")]);
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0],
        node: frozenChildren[0],
      },
    ];

    const result = BoardOperations.applyOperations({ children: frozenChildren }, operations, {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
    });

    expect(result.data.children.map(el => el.id)).toEqual(["b"]);
    expect(frozenChildren.map(el => el.id)).toEqual(["a", "b"]);
  });

  it("move_node 在冻结嵌套结构上仍可执行且不污染原数据", () => {
    const child = createRect("child");
    const parent = createRect("parent", { children: [child] });
    const frozenChildren = deepFreeze([parent, createRect("anchor")]);

    const operations: Operation[] = [{ type: "move_node", path: [0, 0], newPath: [1] }];

    const result = BoardOperations.applyOperations({ children: frozenChildren }, operations, {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
    });

    expect(result.data.children.map(el => el.id)).toEqual(["parent", "child", "anchor"]);
    expect(frozenChildren[0].children?.map(el => el.id)).toEqual(["child"]);
    expect(frozenChildren.map(el => el.id)).toEqual(["parent", "anchor"]);
  });
});

describe("BoardOperations - 路径与性能", () => {
  it("set_node 仅复制受影响路径，未受影响分支保持引用复用", () => {
    const leftChild = createRect("left-child", { x: 1 });
    const leftParent = createRect("left-parent", { children: [leftChild] });
    const rightParent = createRect("right-parent");
    const children = [leftParent, rightParent];

    const operations: Operation[] = [
      {
        type: "set_node",
        path: [0, 0],
        properties: { x: 1 },
        newProperties: { x: 2 },
      },
    ];

    const result = BoardOperations.applyOperations({ children }, operations, {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
    });

    expect(result.data.children).not.toBe(children);
    expect(result.data.children[0]).not.toBe(leftParent);
    expect(result.data.children[0].children?.[0]).not.toBe(leftChild);
    expect(result.data.children[1]).toBe(rightParent);
  });

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
    operations.forEach(op => BoardOperations.markAsNormalized(op));

    const result = BoardOperations.applyOperations({ children: base }, operations);
    expect(result.data.children[0].x).toBe(77);
    result.operations.forEach(op => {
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
    expect(result.data.children.map(el => el.id)).toEqual(["parent", "child", "anchor"]);
    expect(result.data.children[1].x).toBe(500);
  });

  it("大数据量 set_node 性能测试", () => {
    const elementCount = 1000;
    const base: BoardElement[] = Array.from({ length: elementCount }, (_, i) =>
      createRect(`node-${i}`, { x: i })
    );

    const operations: Operation[] = base.map((element, index): Operation => ({
      type: "set_node",
      path: [index],
      properties: { x: element.x },
      newProperties: { x: element.x + 100 },
    }));

    const start = performance.now();
    const result = apply(base, operations);
    const duration = performance.now() - start;

    expect(result.data.children.every((node, idx) => node.x === idx + 100)).toBe(true);
    expect(duration).toBeLessThan(250);
  });
});
