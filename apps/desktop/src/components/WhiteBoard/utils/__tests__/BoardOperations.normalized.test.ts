import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import BoardUtil from "../BoardUtil";
import { BoardElement, Operation } from "../../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createRect = (
  id: string,
  overrides: Partial<BoardElement> = {},
): BoardElement => ({
  id,
  type: "rect",
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 100,
  height: overrides.height ?? 80,
  ...overrides,
});

const apply = (children: BoardElement[], ops: Operation[]) =>
  BoardOperations.applyOperations({ children: clone(children) }, ops, {
    skipSelectionOperations: true,
    skipViewPortOperations: true,
  });

describe("BoardOperations - Normalized 操作", () => {
  it("normalized 操作不会进行路径变换", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];

    // 创建操作并标记为 normalized
    const ops: Operation[] = [
      { type: "remove_node", path: [0], node: base[0] },
      {
        type: "set_node",
        path: [0], // 这个路径在 normalized 模式下不会被变换
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
    ];

    // 标记第二个操作为 normalized
    BoardOperations.markAsNormalized(ops[1]);

    const { data } = apply(base, ops);
    // 删除 a 后,b 在 [0],normalized 的操作应该直接作用于 [0]
    expect(data.children.map((el) => el.id)).toEqual(["b", "c"]);
    expect(data.children[0].x).toBe(100); // b 被修改
  });

  it("所有操作都是 normalized 时跳过预处理", () => {
    const base = [createRect("a"), createRect("b")];

    const ops: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
      {
        type: "set_node",
        path: [1],
        properties: { x: 0 },
        newProperties: { x: 200 },
      },
    ];

    ops.forEach((op) => BoardOperations.markAsNormalized(op));

    const { data, operations } = apply(base, ops);
    expect(data.children[0].x).toBe(100);
    expect(data.children[1].x).toBe(200);
    // 返回的操作应该保持 normalized 标记
    operations.forEach((op) => {
      expect(BoardOperations.isNormalizedOperation(op)).toBe(true);
    });
  });

  it("混合 normalized 和非 normalized 操作", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];

    const ops: Operation[] = [
      { type: "remove_node", path: [0], node: base[0] }, // 非 normalized
      {
        type: "set_node",
        path: [0], // normalized,不会变换
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
      {
        type: "set_node",
        path: [1], // 非 normalized,会被变换为 [0]
        properties: { x: 0 },
        newProperties: { x: 200 },
      },
    ];

    BoardOperations.markAsNormalized(ops[1]);

    const { data } = apply(base, ops);
    // 删除 a 后: [b, c]
    // ops[1] 作用于 [0] (b)
    // ops[2] 原始路径 [1] 变换后为 [0],但 b 已经被 ops[1] 修改了
    expect(data.children[0].x).toBe(200);
    expect(data.children[1].x).toBe(0);
  });

  it("normalized 操作的 move_node", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];

    const ops: Operation[] = [
      { type: "insert_node", path: [0], node: createRect("x") },
      { type: "move_node", path: [2], newPath: [0] }, // normalized
    ];

    BoardOperations.markAsNormalized(ops[1]);

    const { data } = apply(base, ops);
    // insert x 后: [x, a, b, c]
    // normalized move [2]->[0] 应该直接执行,把 b 移到 [0]
    expect(data.children.map((el) => el.id)).toEqual(["b", "x", "a", "c"]);
  });
});

describe("BoardOperations - Undo/Redo 场景", () => {
  it("基础 undo: 单个操作的逆操作", () => {
    const base = [createRect("a", { x: 0 })];

    const op: Operation = {
      type: "set_node",
      path: [0],
      properties: { x: 0 },
      newProperties: { x: 100 },
    };

    // 执行操作
    const { data: afterData } = apply(base, [op]);
    expect(afterData.children[0].x).toBe(100);

    // 生成逆操作
    const inverseOp = BoardUtil.inverseOperation(op);
    BoardOperations.markAsNormalized(inverseOp);

    // 执行 undo
    const { data: undoData } = BoardOperations.applyOperations(
      { children: afterData.children },
      [inverseOp],
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(undoData.children[0].x).toBe(0);
  });

  it("undo insert_node: 应该删除插入的节点", () => {
    const base = [createRect("a"), createRect("b")];
    const newNode = createRect("x");

    const op: Operation = {
      type: "insert_node",
      path: [1],
      node: newNode,
    };

    const { data: afterData } = apply(base, [op]);
    expect(afterData.children.map((el) => el.id)).toEqual(["a", "x", "b"]);

    // undo
    const inverseOp = BoardUtil.inverseOperation(op);
    BoardOperations.markAsNormalized(inverseOp);
    const { data: undoData } = BoardOperations.applyOperations(
      { children: afterData.children },
      [inverseOp],
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(undoData.children.map((el) => el.id)).toEqual(["a", "b"]);
  });

  it("undo remove_node: 应该重新插入删除的节点", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];

    const op: Operation = {
      type: "remove_node",
      path: [1],
      node: base[1],
    };

    const { data: afterData } = apply(base, [op]);
    expect(afterData.children.map((el) => el.id)).toEqual(["a", "c"]);

    // undo
    const inverseOp = BoardUtil.inverseOperation(op);
    BoardOperations.markAsNormalized(inverseOp);
    const { data: undoData } = BoardOperations.applyOperations(
      { children: afterData.children },
      [inverseOp],
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(undoData.children.map((el) => el.id)).toEqual(["a", "b", "c"]);
  });

  it("undo move_node: 应该移回原位置", () => {
    const base = [createRect("a"), createRect("b"), createRect("c")];

    const op: Operation = {
      type: "move_node",
      path: [0],
      newPath: [2],
    };

    const { data: afterData, operations: executedOps } = apply(base, [op]);
    // move_node 的 newPath 是“基于移动前”的路径：在 3 个元素场景下 [2] 并不是“末尾”
    expect(afterData.children.map((el) => el.id)).toEqual(["b", "a", "c"]);

    // undo
    const inverseOp = BoardUtil.inverseOperation(executedOps[0]);
    const { data: undoData } = BoardOperations.applyOperations(
      { children: afterData.children },
      [inverseOp],
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(undoData.children.map((el) => el.id)).toEqual(["a", "b", "c"]);
  });

  it("批量操作的 undo: 逆序执行逆操作", () => {
    const base = [createRect("a", { x: 0 }), createRect("b", { x: 0 })];

    const ops: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
      { type: "insert_node", path: [1], node: createRect("x") },
      {
        type: "set_node",
        path: [1], // 原始 b 的位置，执行时会被 PathRef 调整到新的索引
        properties: { x: 0 },
        newProperties: { x: 200 },
      },
    ];

    const { data: afterData, operations: executedOps } = apply(base, ops);
    expect(afterData.children.map((el) => el.id)).toEqual(["a", "x", "b"]);
    expect(afterData.children[0].x).toBe(100);
    expect(afterData.children[2].x).toBe(200);

    // 生成逆操作并逆序
    const inverseOps = executedOps
      .map((op) => BoardUtil.inverseOperation(op))
      .reverse();
    inverseOps.forEach((op) => BoardOperations.markAsNormalized(op));

    const { data: undoData } = BoardOperations.applyOperations(
      { children: afterData.children },
      inverseOps,
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(undoData.children.map((el) => el.id)).toEqual(["a", "b"]);
    expect(undoData.children[0].x).toBe(0);
    expect(undoData.children[1].x).toBe(0);
  });

  it("redo: 重新执行 undo 的操作", () => {
    const base = [createRect("a", { x: 0 })];

    const ops: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
      { type: "insert_node", path: [1], node: createRect("b") },
    ];

    // 执行操作
    const { data: step1, operations: executedOps } = apply(base, ops);
    expect(step1.children.map((el) => el.id)).toEqual(["a", "b"]);
    expect(step1.children[0].x).toBe(100);

    // undo
    const inverseOps = executedOps
      .map((op) => BoardUtil.inverseOperation(op))
      .reverse();
    inverseOps.forEach((op) => BoardOperations.markAsNormalized(op));
    const { data: step2 } = BoardOperations.applyOperations(
      { children: step1.children },
      inverseOps,
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );
    expect(step2.children.map((el) => el.id)).toEqual(["a"]);
    expect(step2.children[0].x).toBe(0);

    // redo (重新执行原操作)
    executedOps.forEach((op) => BoardOperations.markAsNormalized(op));
    const { data: step3 } = BoardOperations.applyOperations(
      { children: step2.children },
      executedOps,
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );
    expect(step3.children.map((el) => el.id)).toEqual(["a", "b"]);
    expect(step3.children[0].x).toBe(100);
  });

  it("复杂嵌套操作的 undo/redo", () => {
    const child = createRect("child");
    const parent = createRect("parent", { children: [child] });
    const base = [createRect("a"), parent];

    const ops: Operation[] = [
      { type: "move_node", path: [1, 0], newPath: [0] },
      { type: "insert_node", path: [1], node: createRect("x") },
      {
        type: "set_node",
        path: [1, 0], // 指向原始的 child，执行时会被调整到根层
        properties: { x: 0 },
        newProperties: { x: 500 },
      },
    ];

    // forward
    const { data: afterData, operations: executedOps } = apply(base, ops);
    expect(afterData.children.map((el) => el.id)).toEqual([
      "child",
      "a",
      "x",
      "parent",
    ]);
    expect(afterData.children[0].x).toBe(500);

    // undo
    const inverseOps = executedOps
      .map((op) => BoardUtil.inverseOperation(op))
      .reverse();
    inverseOps.forEach((op) => BoardOperations.markAsNormalized(op));
    const { data: undoData } = BoardOperations.applyOperations(
      { children: afterData.children },
      inverseOps,
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(undoData.children.map((el) => el.id)).toEqual(["a", "parent"]);
    const restoredParent = undoData.children[1] as any;
    expect(restoredParent.children[0].id).toBe("child");
    expect(restoredParent.children[0].x).toBe(0);

    // redo
    executedOps.forEach((op) => BoardOperations.markAsNormalized(op));
    const { data: redoData } = BoardOperations.applyOperations(
      { children: undoData.children },
      executedOps,
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(redoData.children.map((el) => el.id)).toEqual([
      "child",
      "a",
      "x",
      "parent",
    ]);
    expect(redoData.children[0].x).toBe(500);
  });

  it("多次 undo/redo 循环", () => {
    const base = [createRect("a", { x: 0 })];

    const op: Operation = {
      type: "set_node",
      path: [0],
      properties: { x: 0 },
      newProperties: { x: 100 },
    };

    let currentData = clone(base);

    // 循环 5 次 undo/redo
    for (let i = 0; i < 5; i++) {
      // do
      const { data: afterDo } = BoardOperations.applyOperations(
        { children: currentData },
        [op],
        {
          skipSelectionOperations: true,
          skipViewPortOperations: true,
        },
      );
      expect(afterDo.children[0].x).toBe(100);

      // undo
      const inverseOp = BoardUtil.inverseOperation(op);
      BoardOperations.markAsNormalized(inverseOp);
      const { data: afterUndo } = BoardOperations.applyOperations(
        { children: afterDo.children },
        [inverseOp],
        {
          skipSelectionOperations: true,
          skipViewPortOperations: true,
        },
      );
      expect(afterUndo.children[0].x).toBe(0);

      currentData = afterUndo.children;
    }
  });
});

describe("BoardOperations - Diff 生成的操作", () => {
  it("diff 操作应该原样执行", () => {
    const before = [createRect("a"), createRect("b")];
    const after = [createRect("a"), createRect("x"), createRect("b")];

    // 模拟 diff 生成的操作 (实际应该使用 BoardUtil.diff)
    const diffOps: Operation[] = [
      { type: "insert_node", path: [1], node: after[1] },
    ];
    diffOps.forEach((op) => BoardOperations.markAsNormalized(op));

    const { data } = BoardOperations.applyOperations(
      { children: clone(before) },
      diffOps,
      {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      },
    );

    expect(data.children.map((el) => el.id)).toEqual(["a", "x", "b"]);
  });

  it("多个 diff 操作连续应用", () => {
    const start = [createRect("a")];

    // 模拟连续的状态变化和 diff
    const diffs = [
      [{ type: "insert_node" as const, path: [1], node: createRect("b") }],
      [{ type: "insert_node" as const, path: [2], node: createRect("c") }],
      [
        {
          type: "set_node" as const,
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ],
    ];

    let currentData = clone(start);
    for (const diffOps of diffs) {
      diffOps.forEach((op) => BoardOperations.markAsNormalized(op));
      const { data } = BoardOperations.applyOperations(
        { children: currentData },
        diffOps,
        {
          skipSelectionOperations: true,
          skipViewPortOperations: true,
        },
      );
      currentData = data.children;
    }

    expect(currentData.map((el) => el.id)).toEqual(["a", "b", "c"]);
    expect(currentData[0].x).toBe(100);
  });
});

describe("BoardOperations - 边界 normalized 场景", () => {
  it("normalized 操作路径失效应该被跳过", () => {
    const base = [createRect("a")];

    const ops: Operation[] = [
      {
        type: "set_node",
        path: [99], // 不存在的路径
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
    ];
    BoardOperations.markAsNormalized(ops[0]);

    const { data, operations } = apply(base, ops);
    expect(data.children).toEqual(base);
    expect(operations).toHaveLength(0);
  });

  it("部分 normalized 部分非 normalized 的混合", () => {
    const base = [
      createRect("a", { x: 0 }),
      createRect("b", { x: 0 }),
      createRect("c", { x: 0 }),
    ];

    const ops: Operation[] = [
      { type: "remove_node", path: [0], node: base[0] }, // 非 normalized
      {
        type: "set_node",
        path: [1], // 非 normalized, 会变换为 [0]
        properties: { x: 0 },
        newProperties: { x: 100 },
      },
      {
        type: "set_node",
        path: [0], // normalized, 不会变换
        properties: { x: 0 },
        newProperties: { x: 200 },
      },
    ];
    BoardOperations.markAsNormalized(ops[2]);

    const { data } = apply(base, ops);
    // 删除 a: [b, c]
    // ops[1] 路径 [1] -> [0], 修改 b: [b(100), c]
    // ops[2] 路径 [0], 修改 b: [b(200), c]
    expect(data.children.map((el) => el.id)).toEqual(["b", "c"]);
    expect(data.children[0].x).toBe(200);
    expect(data.children[1].x).toBe(0);
  });

  it("normalized move 操作的 path 和 newPath 都不变换", () => {
    const base = [
      createRect("a"),
      createRect("b"),
      createRect("c"),
      createRect("d"),
    ];

    const ops: Operation[] = [
      { type: "insert_node", path: [0], node: createRect("x") },
      { type: "move_node", path: [2], newPath: [5] }, // normalized
    ];
    BoardOperations.markAsNormalized(ops[1]);

    const { data } = apply(base, ops);
    // insert x: [x, a, b, c, d]
    // normalized move [2] -> [5]: [x, a, c, d, b]
    expect(data.children.map((el) => el.id)).toEqual(["x", "a", "c", "d", "b"]);
  });
});
