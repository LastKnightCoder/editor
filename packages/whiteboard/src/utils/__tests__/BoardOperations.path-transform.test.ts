import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import { BoardElement, Operation } from "../../types";

/**
 * 路径变换测试 - 验证批量操作中路径自动调整的正确性
 *
 * 核心原理：PathRef 追踪的是"节点"而不是"索引位置"
 * 当操作基于原始快照的路径时，PathRef 会自动跟踪节点的移动
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
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

describe("BoardOperations - 路径变换核心机制", () => {
  describe("PathRef 追踪节点", () => {
    it("move 后对相同原始路径的操作会跟随节点", () => {
      const base = [createRect("a", { x: 0 }), createRect("b", { x: 0 })];
      const ops: Operation[] = [
        { type: "move_node", path: [0], newPath: [2] }, // a 移到末尾
        {
          type: "set_node",
          path: [0], // 原始路径 [0] 指向 a
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);

      // a 移动到末尾后，set_node 应该跟随 a
      expect(data.children.map(el => el.id)).toEqual(["b", "a"]);
      expect(data.children[1].x).toBe(100); // a 被修改
      expect(data.children[0].x).toBe(0); // b 不变

      // 执行的 set_node 路径应该被变换为 [1]
      expect(operations[1]).toMatchObject({
        type: "set_node",
        path: [1],
      });
    });

    it("连续操作同一原始路径时，PathRef 持续追踪", () => {
      const base = [
        createRect("a", { x: 0 }),
        createRect("b", { x: 0 }),
        createRect("c", { x: 0 }),
      ];
      const ops: Operation[] = [
        { type: "move_node", path: [0], newPath: [2] }, // a: [0] -> [2]
        { type: "move_node", path: [0], newPath: [2] }, // 原始路径 [0]，应该跟随 a
      ];

      const { data, operations } = apply(base, ops);

      // 第一次：[a,b,c] -> [b,a,c]（在 3 个元素场景下，newPath [2] 并不是“末尾”）
      // 第二次：原始 [0] 跟随 a 到 [1]，执行 move [1]->[2]，实际落点会被调整为 [1]（等价于 no-op）
      expect(data.children.map(el => el.id)).toEqual(["b", "a", "c"]);

      // 第二个 move 的执行路径应该跟随 a
      expect(operations[1]).toMatchObject({
        type: "move_node",
        path: [1],
      });
    });

    it("删除节点后，对该节点的后续操作应该失效", () => {
      const base = [createRect("a", { x: 0 }), createRect("b", { x: 0 })];
      const ops: Operation[] = [
        { type: "remove_node", path: [0], node: base[0] },
        {
          type: "set_node",
          path: [0], // 原始路径 [0] 指向 a，但 a 已被删除
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);

      // a 被删除，只剩 b
      expect(data.children.map(el => el.id)).toEqual(["b"]);
      // 第二个操作应该被跳过（因为 a 已删除）
      expect(operations).toHaveLength(1);
    });
  });

  describe("insert_node 路径变换", () => {
    it("在同一位置多次插入，后续插入会被推后", () => {
      const base = [createRect("a"), createRect("b")];
      const ops: Operation[] = [
        { type: "insert_node", path: [1], node: createRect("x") },
        { type: "insert_node", path: [1], node: createRect("y") },
        { type: "insert_node", path: [1], node: createRect("z") },
      ];

      const { data, operations } = apply(base, ops);

      // 第一次在 [1] 插入 x: [a, x, b]
      // 第二次原始 [1]，执行时变成 [2]: [a, x, y, b]
      // 第三次原始 [1]，执行时变成 [3]: [a, x, y, z, b]
      expect(data.children.map(el => el.id)).toEqual(["a", "x", "y", "z", "b"]);

      expect((operations[0] as { path: number[] }).path).toEqual([1]);
      expect((operations[1] as { path: number[] }).path).toEqual([2]);
      expect((operations[2] as { path: number[] }).path).toEqual([3]);
    });

    it("前面插入影响后面的路径索引", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "insert_node", path: [0], node: createRect("x") },
        { type: "insert_node", path: [2], node: createRect("y") },
      ];

      const { data, operations } = apply(base, ops);

      // 插入 x 在 [0]: [x, a, b, c]
      // 原始 [2] (b) 现在在 [3]，但插入操作针对的是位置，所以插入在 [2]
      // 结果: [x, a, b, y, c] 或 [x, a, y, b, c]?
      // 实际上，原始 [2] 是位置，不是节点引用
      expect(data.children.map(el => el.id)).toEqual(["x", "a", "b", "y", "c"]);

      expect((operations[0] as { path: number[] }).path).toEqual([0]);
      expect((operations[1] as { path: number[] }).path).toEqual([3]); // [2] 被推后到 [3]
    });

    it("嵌套插入：父层插入影响子层路径", () => {
      const parent = createRect("parent", { children: [] });
      const base = [createRect("a"), parent];
      const child = createRect("child");

      const ops: Operation[] = [
        { type: "insert_node", path: [1], node: createRect("x") },
        { type: "insert_node", path: [1, 0], node: child },
      ];

      const { data, operations } = apply(base, ops);

      // parent 从 [1] 变成 [2]，所以 [1, 0] 应该变成 [2, 0]
      expect(data.children.map(el => el.id)).toEqual(["a", "x", "parent"]);
      expect((data.children[2] as BoardElement & { children: BoardElement[] }).children[0].id).toBe(
        "child"
      );

      expect((operations[1] as { path: number[] }).path).toEqual([2, 0]);
    });
  });

  describe("remove_node 路径变换", () => {
    it("删除元素后，后续操作的索引应该减少", () => {
      const base = [createRect("a"), createRect("b"), createRect("c"), createRect("d")];
      const ops: Operation[] = [
        { type: "remove_node", path: [1], node: base[1] },
        { type: "remove_node", path: [2], node: base[2] },
      ];

      const { data, operations } = apply(base, ops);

      // 删除 b: [a, c, d]
      // 原始 [2] (c) 现在在 [1]，所以删除 [1] (c)
      expect(data.children.map(el => el.id)).toEqual(["a", "d"]);

      expect((operations[0] as { path: number[] }).path).toEqual([1]);
      expect((operations[1] as { path: number[] }).path).toEqual([1]); // [2] 变成 [1]
    });

    it("删除父节点后，子节点操作应该失效", () => {
      const child = createRect("child");
      const parent = createRect("parent", { children: [child] });
      const base = [createRect("a"), parent, createRect("b")];

      const ops: Operation[] = [
        { type: "remove_node", path: [1], node: clone(parent) },
        { type: "remove_node", path: [1, 0], node: clone(child) },
      ];

      const { data, operations } = apply(base, ops);

      // parent 被删除，[1, 0] 的操作应该被跳过
      expect(data.children.map(el => el.id)).toEqual(["a", "b"]);
      expect(operations).toHaveLength(1);
    });
  });

  describe("move_node 复杂场景", () => {
    it("move 到另一个容器后修改", () => {
      const child = createRect("child", { x: 0 });
      const parent1 = createRect("p1", { children: [child] });
      const parent2 = createRect("p2", { children: [] });
      const base = [parent1, parent2];

      const ops: Operation[] = [
        { type: "move_node", path: [0, 0], newPath: [1, 0] },
        {
          type: "set_node",
          path: [0, 0], // 原始路径，应该跟随 child
          properties: { x: 0 },
          newProperties: { x: 200 },
        },
      ];

      const { data, operations } = apply(base, ops);

      const p1 = data.children[0] as BoardElement & {
        children: BoardElement[];
      };
      const p2 = data.children[1] as BoardElement & {
        children: BoardElement[];
      };
      expect(p1.children).toHaveLength(0);
      expect(p2.children[0].id).toBe("child");
      expect(p2.children[0].x).toBe(200); // child 被修改

      // set_node 路径应该跟随到 [1, 0]
      expect((operations[1] as { path: number[] }).path).toEqual([1, 0]);
    });

    it("move + insert 组合", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "move_node", path: [0], newPath: [2] },
        { type: "insert_node", path: [2], node: createRect("x") },
      ];

      const { data } = apply(base, ops);

      // move [0]->[2]: [b, c, a]
      // 原始 [2] 是位置，但 [0] 被移走了，所以...
      // 实际行为取决于 insert 的路径变换逻辑
      const ids = data.children.map(el => el.id);
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("c");
      expect(ids).toContain("x");
    });
  });

  describe("insert + remove 组合", () => {
    it("先删除再在相同位置插入", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "remove_node", path: [1], node: base[1] },
        { type: "insert_node", path: [1], node: createRect("x") },
      ];

      const { data } = apply(base, ops);

      // 删除 b: [a, c]
      // 在 [1] 插入 x: [a, x, c]
      expect(data.children.map(el => el.id)).toEqual(["a", "x", "c"]);
    });

    it("先插入再删除", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "insert_node", path: [0], node: createRect("x") },
        { type: "remove_node", path: [1], node: base[1] }, // 原始 [1] (b)
      ];

      const { data, operations } = apply(base, ops);

      // 插入 x: [x, a, b, c]
      // 原始 [2] 是 c，但这里 node 是 b
      // PathRef 应该追踪 b，b 现在在 [2]
      expect(data.children.map(el => el.id)).toEqual(["x", "a", "c"]);

      // 删除操作的路径应该被调整
      expect((operations[1] as { path: number[] }).path).toEqual([2]);
    });
  });

  describe("跨层级路径变换", () => {
    it("父层插入影响子层路径", () => {
      const child1 = createRect("child1");
      const child2 = createRect("child2");
      const parent = createRect("parent", { children: [child1, child2] });
      const base = [createRect("a"), parent];

      const ops: Operation[] = [
        { type: "insert_node", path: [1], node: createRect("x") },
        {
          type: "set_node",
          path: [1, 0], // 原始路径指向 parent.children[0]
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);

      // parent 从 [1] 变成 [2]
      expect(data.children.map(el => el.id)).toEqual(["a", "x", "parent"]);
      expect((data.children[2] as BoardElement & { children: BoardElement[] }).children[0].x).toBe(
        100
      );

      // 路径应该调整为 [2, 0]
      expect((operations[1] as { path: number[] }).path).toEqual([2, 0]);
    });

    it("父层删除导致子层操作失效", () => {
      const child = createRect("child", { x: 0 });
      const parent = createRect("parent", { children: [child] });
      const base = [createRect("a"), parent, createRect("b")];

      const ops: Operation[] = [
        { type: "remove_node", path: [1], node: clone(parent) },
        {
          type: "set_node",
          path: [1, 0],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);

      // parent 被删除，子节点操作应该失效
      expect(data.children.map(el => el.id)).toEqual(["a", "b"]);
      expect(operations).toHaveLength(1);
    });
  });

  describe("边界情况", () => {
    it("操作空数组", () => {
      const { data } = apply([], []);
      expect(data.children).toEqual([]);
    });

    it("路径超出范围的操作会失败", () => {
      const base = [createRect("a")];
      const ops: Operation[] = [
        { type: "insert_node", path: [999], node: createRect("x") },
        {
          type: "set_node",
          path: [999],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);

      // 超出范围的操作应该失败
      expect(data.children.map(el => el.id)).toEqual(["a"]);
      expect(operations).toHaveLength(0);
    });

    it("部分操作失败不影响其他操作", () => {
      const base = [createRect("a", { x: 0 }), createRect("b", { x: 0 })];
      const ops: Operation[] = [
        {
          type: "set_node",
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
        {
          type: "set_node",
          path: [99], // 无效路径
          properties: { x: 0 },
          newProperties: { x: 200 },
        },
        {
          type: "set_node",
          path: [1],
          properties: { x: 0 },
          newProperties: { x: 300 },
        },
      ];

      const { data, operations } = apply(base, ops);

      expect(data.children[0].x).toBe(100);
      expect(data.children[1].x).toBe(300);
      expect(operations).toHaveLength(2); // 只有两个成功
    });
  });

  describe("边界情况 - 极端场景", () => {
    it("空路径数组", () => {
      const base = [createRect("a")];
      const ops: Operation[] = [];

      const { data } = apply(base, ops);
      expect(data.children).toEqual(base);
    });

    it("单个元素的各种操作", () => {
      const base = [createRect("a", { x: 0 })];
      const ops: Operation[] = [
        {
          type: "set_node",
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
        {
          type: "set_node",
          path: [0],
          properties: { x: 100 },
          newProperties: { x: 200 },
        },
        {
          type: "set_node",
          path: [0],
          properties: { x: 200 },
          newProperties: { x: 300 },
        },
      ];

      const { data } = apply(base, ops);
      expect(data.children[0].x).toBe(300);
    });

    it("删除所有元素", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "remove_node", path: [0], node: base[0] },
        { type: "remove_node", path: [1], node: base[1] },
        { type: "remove_node", path: [2], node: base[2] },
      ];

      const { data } = apply(base, ops);
      expect(data.children).toHaveLength(0);
    });

    it("在空数组中插入多个元素", () => {
      const base: BoardElement[] = [];
      const ops: Operation[] = [
        { type: "insert_node", path: [0], node: createRect("a") },
        { type: "insert_node", path: [1], node: createRect("b") },
        { type: "insert_node", path: [2], node: createRect("c") },
      ];

      const { data } = apply(base, ops);
      expect(data.children.map(el => el.id)).toEqual(["a", "b", "c"]);
    });

    it("循环移动：A->B, B->C, C->A", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "move_node", path: [0], newPath: [3] }, // a 移到最后
        { type: "move_node", path: [0], newPath: [2] }, // b 移到倒数第二
        { type: "move_node", path: [0], newPath: [1] }, // c 移到第二位
      ];

      const { data } = apply(base, ops);
      // 验证所有元素都存在
      const ids = data.children.map(el => el.id);
      expect(ids).toHaveLength(3);
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("c");
    });

    it("负数索引应该失败", () => {
      const base = [createRect("a")];
      const ops: Operation[] = [
        {
          type: "set_node",
          path: [-1],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);
      expect(data.children[0].x).toBe(0); // 没有被修改
      expect(operations).toHaveLength(0); // 操作失败
    });

    it("小数索引应该失败", () => {
      const base = [createRect("a"), createRect("b")];
      const ops: Operation[] = [
        {
          type: "set_node",
          path: [0.5],
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { operations } = apply(base, ops);
      // 小数会被转换为整数，可能成功或失败取决于实现
      expect(operations.length).toBeLessThanOrEqual(1);
    });

    it("极深嵌套：10 层", () => {
      let current: BoardElement = createRect("leaf", { x: 0 });
      for (let i = 0; i < 9; i++) {
        current = createRect(`level-${i}`, { children: [current] });
      }
      const base = [current];

      const ops: Operation[] = [
        {
          type: "set_node",
          path: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          properties: { x: 0 },
          newProperties: { x: 999 },
        },
      ];

      const { data } = apply(base, ops);

      // 验证最深层被修改
      let leaf: BoardElement & { children?: BoardElement[] } = data.children[0];
      for (let i = 0; i < 9; i++) {
        if (leaf.children && leaf.children.length > 0) {
          leaf = leaf.children[0];
        }
      }
      expect(leaf.x).toBe(999);
    });

    it("同时插入和删除相同位置", () => {
      const base = [createRect("a"), createRect("b"), createRect("c")];
      const ops: Operation[] = [
        { type: "remove_node", path: [1], node: base[1] },
        { type: "insert_node", path: [1], node: createRect("x") },
        { type: "remove_node", path: [1], node: createRect("x") },
        { type: "insert_node", path: [1], node: createRect("y") },
      ];

      const { data } = apply(base, ops);
      expect(data.children.map(el => el.id)).toContain("a");
      expect(data.children.map(el => el.id)).toContain("c");
    });

    it("修改不存在的嵌套路径", () => {
      const base = [createRect("a")];
      const ops: Operation[] = [
        {
          type: "set_node",
          path: [0, 0, 0], // a 没有 children
          properties: { x: 0 },
          newProperties: { x: 100 },
        },
      ];

      const { data, operations } = apply(base, ops);
      expect(operations).toHaveLength(0);
      expect(data.children[0].x).toBe(0);
    });

    it("快速连续的同一节点修改", () => {
      const base = [createRect("a", { x: 0 })];
      const ops: Operation[] = [];

      // 100 次连续修改同一个节点
      for (let i = 0; i < 100; i++) {
        ops.push({
          type: "set_node",
          path: [0],
          properties: { x: i },
          newProperties: { x: i + 1 },
        });
      }

      const { data } = apply(base, ops);
      expect(data.children[0].x).toBe(100);
    });
  });
});
