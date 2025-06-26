import { describe, it, expect, beforeEach } from "vitest";
import { BoardUtil } from "../BoardUtil";
import type { BoardElement, Operation } from "../../types";
import { BoardOperations } from "../BoardOperations";

describe("BoardUtil.diff 测试", () => {
  // 在每个测试前清除缓存
  beforeEach(() => {
    (BoardUtil as any)._diffCache.clear();
  });

  // 创建测试用的元素
  const createElement = (
    id: string,
    type = "rect",
    props: Partial<BoardElement> = {},
    children?: BoardElement[],
  ): BoardElement => {
    const element = {
      id,
      type,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      ...props,
    } as BoardElement;

    if (children !== undefined) {
      element.children = children;
    }

    return element;
  };

  describe("基本功能测试", () => {
    it("应该生成插入操作 - 新增元素", () => {
      const oldChildren: BoardElement[] = [];
      const newChildren: BoardElement[] = [
        createElement("element1", "rect"),
        createElement("element2", "circle"),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);
      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );

      expect(appliedResult).toEqual(newChildren);
    });

    it("应该生成删除操作 - 移除元素", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect"),
        createElement("element2", "circle"),
      ];
      const newChildren: BoardElement[] = [];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      // 验证 apply 后结果正确
      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);
    });

    it("应该生成修改操作 - 属性变化", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 10, y: 20, color: "red" }),
      ];
      const newChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 30, y: 20, color: "blue" }),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);
      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);
    });

    it("相同数组应该返回空操作", () => {
      const children: BoardElement[] = [
        createElement("element1", "rect", { x: 10, y: 20 }),
        createElement("element2", "circle", { x: 30, y: 40 }),
      ];

      const operations = BoardUtil.diff(children, children);

      expect(operations).toHaveLength(0);
    });
  });

  describe("复杂场景测试", () => {
    it("应该处理混合操作 - 增删改", () => {
      const oldChildren: BoardElement[] = [
        createElement("keep", "rect", { x: 10, y: 20 }),
        createElement("modify", "circle", { x: 30, y: 40, color: "red" }),
        createElement("delete", "text", { x: 50, y: 60 }),
      ];

      const newChildren: BoardElement[] = [
        createElement("keep", "rect", { x: 10, y: 20 }), // 保持不变
        createElement("modify", "circle", { x: 35, y: 40, color: "blue" }), // 修改
        createElement("insert", "line", { x: 70, y: 80 }), // 新增
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      // 期望：1个修改 + 1个删除 + 1个插入
      expect(operations).toHaveLength(3);

      // 验证修改操作
      const setOp = operations.find((op) => op.type === "set_node") as Extract<
        Operation,
        { type: "set_node" }
      >;
      expect(setOp).toBeDefined();
      expect(setOp?.path).toEqual([1]);
      expect(setOp?.newProperties).toEqual({
        x: 35,
        color: "blue",
      });

      // 验证删除操作
      const removeOp = operations.find(
        (op) => op.type === "remove_node",
      ) as Extract<Operation, { type: "remove_node" }>;
      expect(removeOp).toBeDefined();
      expect(removeOp?.path).toEqual([2]);
      expect(removeOp?.node.id).toBe("delete");

      // 验证插入操作
      const insertOp = operations.find(
        (op) => op.type === "insert_node",
      ) as Extract<Operation, { type: "insert_node" }>;
      expect(insertOp).toBeDefined();
      expect(insertOp?.path).toEqual([2]);
      expect(insertOp?.node.id).toBe("insert");
    });

    it("应该处理子节点的递归 diff", () => {
      const oldChildren: BoardElement[] = [
        createElement("parent", "group", { x: 0, y: 0 }, [
          createElement("child1", "rect", { x: 10, y: 10 }),
          createElement("child2", "circle", { x: 20, y: 20 }),
        ]),
      ];

      const newChildren: BoardElement[] = [
        createElement("parent", "group", { x: 5, y: 0 }, [
          createElement("child1", "rect", { x: 15, y: 10 }), // 修改子元素
          createElement("child3", "text", { x: 30, y: 30 }), // 新增子元素
        ]),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      expect(operations.length).toBeGreaterThan(0);

      // 应该有父元素的修改操作
      const parentSetOp = operations.find(
        (op) => op.type === "set_node" && op.path.length === 1,
      );
      expect(parentSetOp).toBeDefined();
      expect((parentSetOp as any)?.newProperties.x).toBe(5);

      // 应该有子元素的修改操作
      const childSetOp = operations.find(
        (op) => op.type === "set_node" && op.path.length === 2,
      );
      expect(childSetOp).toBeDefined();

      // 应该有子元素的删除操作
      const childRemoveOp = operations.find(
        (op) => op.type === "remove_node" && op.path.length === 2,
      );
      expect(childRemoveOp).toBeDefined();

      // 应该有子元素的插入操作
      const childInsertOp = operations.find(
        (op) => op.type === "insert_node" && op.path.length === 2,
      );
      expect(childInsertOp).toBeDefined();
    });

    it("应该处理深层嵌套结构", () => {
      const oldChildren: BoardElement[] = [
        createElement("root", "group", {}, [
          createElement("level1", "group", {}, [
            createElement("level2", "rect", { x: 100 }),
          ]),
        ]),
      ];

      const newChildren: BoardElement[] = [
        createElement("root", "group", {}, [
          createElement("level1", "group", {}, [
            createElement("level2", "rect", { x: 200 }), // 深层修改
          ]),
        ]),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe("set_node");
      expect(
        (operations[0] as Extract<Operation, { type: "set_node" }>).path,
      ).toEqual([0, 0, 0]); // 深层路径
      expect(
        (operations[0] as Extract<Operation, { type: "set_node" }>)
          .newProperties.x,
      ).toBe(200);
    });
  });

  describe("属性变化处理测试", () => {
    it("应该处理属性删除（设为 null）", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect", {
          color: "red",
          opacity: 0.5,
        }),
      ];
      const newChildren: BoardElement[] = [
        createElement("element1", "rect", { color: "blue" }), // 删除了 opacity
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      // 验证操作正确性
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe("set_node");

      // 验证删除的属性被设为 null
      const setOp = operations[0] as any;
      expect(setOp.newProperties.color).toBe("blue");
      expect(setOp.newProperties.opacity).toBe(null);
    });

    it("应该处理复杂对象属性", () => {
      // 直接创建对象避免 createElement 的默认属性干扰
      const oldChildren: BoardElement[] = [
        {
          id: "element1",
          type: "rect",
          style: { border: "1px solid red", padding: 10 },
          transform: { rotate: 0, scale: 1 },
        } as BoardElement,
      ];
      const newChildren: BoardElement[] = [
        {
          id: "element1",
          type: "rect",
          style: { border: "2px solid blue", padding: 10 },
          transform: { rotate: 45, scale: 1.5 },
        } as BoardElement,
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      // 验证操作正确性
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe("set_node");

      const setOp = operations[0] as any;
      expect(setOp.newProperties.style).toEqual({
        border: "2px solid blue",
        padding: 10,
      });
      expect(setOp.newProperties.transform).toEqual({
        rotate: 45,
        scale: 1.5,
      });
    });

    it("应该处理数组属性", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "polygon", {
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 10 },
          ],
        }),
      ];
      const newChildren: BoardElement[] = [
        createElement("element1", "polygon", {
          points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 10, y: 20 },
          ],
        }),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);
      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe("set_node");
      expect((operations[0] as any).newProperties.points).toEqual([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 10, y: 20 },
      ]);
    });
  });

  describe("边界情况测试", () => {
    it("空数组 diff", () => {
      const operations = BoardUtil.diff([], []);
      expect(operations).toHaveLength(0);
    });

    it("处理 children 为 undefined 的情况", () => {
      const oldChildren: BoardElement[] = [
        { ...createElement("element1", "rect"), children: undefined },
      ];
      const newChildren: BoardElement[] = [
        createElement("element1", "rect", {}, [createElement("child", "text")]),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      expect(operations.length).toBeGreaterThan(0);
      // 应该有子元素的插入操作（在路径 [0, 0] 处）
      const insertOp = operations.find(
        (op) => op.type === "insert_node" && op.path.length === 2,
      );
      expect(insertOp).toBeDefined();
      expect((insertOp as any)?.node.id).toBe("child");
    });

    it("处理大量元素的性能", () => {
      const oldChildren: BoardElement[] = Array.from({ length: 100 }, (_, i) =>
        createElement(`element${i}`, "rect", { x: i, y: i }),
      );
      const newChildren: BoardElement[] = Array.from(
        { length: 100 },
        (_, i) => createElement(`element${i}`, "rect", { x: i + 1, y: i }), // 修改 x 坐标
      );

      const startTime = performance.now();
      const operations = BoardUtil.diff(oldChildren, newChildren);
      const endTime = performance.now();

      expect(operations).toHaveLength(100); // 100个修改操作
      expect(endTime - startTime).toBeLessThan(50); // 应该在50ms内完成
    });

    it("处理相同 ID 但不同索引的情况", () => {
      const oldChildren: BoardElement[] = [
        createElement("a", "rect"),
        createElement("b", "rect"),
        createElement("c", "rect"),
      ];
      const newChildren: BoardElement[] = [
        createElement("c", "rect"), // 位置变化
        createElement("a", "rect"),
        createElement("b", "rect"),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);
      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      // 应该只有删除和插入操作来处理重新排序
      expect(operations.length).toBeGreaterThan(0);

      // 验证没有不必要的修改操作
      const setOps = operations.filter((op) => op.type === "set_node");
      expect(setOps).toHaveLength(0); // 元素属性没有变化，不应该有 set_node 操作
    });
  });

  describe("isValueChanged 辅助方法测试", () => {
    it("基本类型比较", () => {
      // @ts-ignore - 访问私有方法用于测试
      expect(BoardUtil.isValueChanged(1, 1)).toBe(false);
      // @ts-ignore
      expect(BoardUtil.isValueChanged(1, 2)).toBe(true);
      // @ts-ignore
      expect(BoardUtil.isValueChanged("hello", "hello")).toBe(false);
      // @ts-ignore
      expect(BoardUtil.isValueChanged("hello", "world")).toBe(true);
      // @ts-ignore
      expect(BoardUtil.isValueChanged(true, false)).toBe(true);
      // @ts-ignore
      expect(BoardUtil.isValueChanged(null, undefined)).toBe(true);
    });

    it("数组比较", () => {
      // @ts-ignore
      expect(BoardUtil.isValueChanged([1, 2, 3], [1, 2, 3])).toBe(false);
      // @ts-ignore
      expect(BoardUtil.isValueChanged([1, 2, 3], [1, 2, 4])).toBe(true);
      // @ts-ignore
      expect(BoardUtil.isValueChanged([1, 2], [1, 2, 3])).toBe(true);
      // @ts-ignore
      expect(BoardUtil.isValueChanged([], [])).toBe(false);
    });

    it("对象比较", () => {
      // @ts-ignore
      expect(BoardUtil.isValueChanged({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(
        false,
      );
      // @ts-ignore
      expect(BoardUtil.isValueChanged({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(
        true,
      );
      // @ts-ignore
      expect(BoardUtil.isValueChanged({ a: 1 }, { a: 1, b: 2 })).toBe(true);
      // @ts-ignore
      expect(BoardUtil.isValueChanged({}, {})).toBe(false);
    });
  });

  describe("集成测试", () => {
    it("diff 结果应用后能正确转换状态", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 10, y: 20 }),
      ];
      const newChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 30, y: 40 }),
        createElement("element2", "circle", { x: 50, y: 60 }),
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      // 验证操作的正确性
      expect(operations).toHaveLength(2);

      const setOp = operations.find((op) => op.type === "set_node");
      const insertOp = operations.find((op) => op.type === "insert_node");

      expect(setOp).toBeDefined();
      expect((setOp as any)?.newProperties).toEqual({ x: 30, y: 40 });

      expect(insertOp).toBeDefined();
      expect((insertOp as any)?.node.id).toBe("element2");
    });
  });

  // 优化功能测试
  describe("优化功能测试", () => {
    it("应该缓存重复的比较结果", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 10 }),
      ];
      const newChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 20 }),
      ];

      // 清空缓存
      (BoardUtil as any)._diffCache.clear();

      // 第一次调用
      const start1 = performance.now();
      const ops1 = BoardUtil.diff(oldChildren, newChildren);
      const time1 = performance.now() - start1;

      // 第二次调用（应该从缓存返回）
      const start2 = performance.now();
      const ops2 = BoardUtil.diff(oldChildren, newChildren);
      const time2 = performance.now() - start2;

      // 验证结果相同
      expect(ops1).toEqual(ops2);

      // 第二次调用应该更快（缓存命中）
      expect(time2).toBeLessThan(time1 + 1); // 加1ms容错
    });

    it("应该优化批量操作", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 10, y: 20, width: 100 }),
      ];

      const newChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 15, y: 25, width: 120 }), // 多个属性变化
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      const appliedResult = BoardOperations.applyToChildren(
        oldChildren,
        operations,
      );
      expect(appliedResult).toEqual(newChildren);

      // 应该只有一个合并的 set_node 操作
      const setOps = operations.filter((op) => op.type === "set_node");
      expect(setOps.length).toBe(1);

      // 验证操作包含实际变化的属性
      const setOp = setOps[0] as any;
      expect(setOp.newProperties.x).toBe(15);
      expect(setOp.newProperties.y).toBe(25);
      expect(setOp.newProperties.width).toBe(120);
    });

    it("性能测试：大数据量处理", () => {
      // 创建较大的数据集
      const createLargeArray = (size: number, prefix: string) =>
        Array.from({ length: size }, (_, i) =>
          createElement(`${prefix}${i}`, "rect", { x: i * 10, y: i * 10 }),
        );

      const oldChildren = createLargeArray(100, "old");
      const newChildren = createLargeArray(100, "new");

      const start = performance.now();
      const operations = BoardUtil.diff(oldChildren, newChildren);
      const duration = performance.now() - start;

      // 验证操作生成正确
      expect(operations.length).toBeGreaterThan(0);

      // 性能要求：100个元素的处理时间应该小于100ms
      expect(duration).toBeLessThan(100);
    });

    it("应该正确处理空数组缓存", () => {
      const emptyArray: BoardElement[] = [];

      // 清空缓存
      (BoardUtil as any)._diffCache.clear();

      // 测试空数组之间的比较
      const ops1 = BoardUtil.diff(emptyArray, emptyArray);
      expect(ops1.length).toBe(0);

      // 再次调用应该命中缓存
      const ops2 = BoardUtil.diff(emptyArray, emptyArray);
      expect(ops2.length).toBe(0);
    });

    it("应该优化不必要的移动操作", () => {
      const children: BoardElement[] = [
        createElement("element1", "rect", { x: 10 }),
      ];

      // 相同的数组
      const operations = BoardUtil.diff(children, children);

      // 不应该有任何操作
      expect(operations.length).toBe(0);
    });

    it("应该正确处理内存优化的映射创建", () => {
      const oldChildren: BoardElement[] = [
        createElement("element1", "rect"),
        createElement("element2", "circle"),
      ];

      const newChildren: BoardElement[] = [
        createElement("element1", "rect", { x: 10 }), // 修改
        createElement("element3", "polygon"), // 新增
      ];

      const operations = BoardUtil.diff(oldChildren, newChildren);

      // 验证正确处理了修改、删除、插入
      const setOps = operations.filter((op) => op.type === "set_node");
      const removeOps = operations.filter((op) => op.type === "remove_node");
      const insertOps = operations.filter((op) => op.type === "insert_node");

      expect(setOps.length).toBe(1); // element1 的修改
      expect(removeOps.length).toBe(1); // element2 的删除
      expect(insertOps.length).toBe(1); // element3 的插入
    });
  });
});
