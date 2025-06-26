import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import { BoardElement, Operation } from "../../types";

describe("BoardOperations 测试", () => {
  describe("基本操作测试", () => {
    it("应该处理 insert_node 操作", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [1],
          node: {
            id: "element2",
            type: "circle",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(children[0]);
      expect(result[1].id).toBe("element2");
      expect(result[1].type).toBe("circle");
    });

    it("应该处理 remove_node 操作", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "element2", type: "circle", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [0],
          node: children[0],
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("element2");
    });

    it("应该处理 set_node 操作", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "set_node",
          path: [0],
          properties: { x: 0, y: 0 },
          newProperties: { x: 50, y: 100 },
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(50);
      expect(result[0].y).toBe(100);
      expect(result[0].width).toBe(100); // 其他属性保持不变
    });
  });

  describe("复杂操作测试", () => {
    it("应该处理混合操作", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "element2", type: "circle", x: 10, y: 10, width: 50, height: 50 },
      ];

      const operations: Operation[] = [
        // 修改第一个元素
        {
          type: "set_node",
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 30 },
        },
        // 删除第二个元素
        {
          type: "remove_node",
          path: [1],
          node: children[1],
        },
        // 插入新元素
        {
          type: "insert_node",
          path: [1],
          node: {
            id: "element3",
            type: "text",
            x: 100,
            y: 100,
            width: 200,
            height: 50,
          },
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      expect(result).toHaveLength(2);
      expect(result[0].x).toBe(30); // 修改生效
      expect(result[1].id).toBe("element3"); // 新元素插入
      expect(result[1].type).toBe("text");
    });

    it("应该处理子节点操作", () => {
      const children: BoardElement[] = [
        {
          id: "parent",
          type: "container",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          children: [
            { id: "child1", type: "rect", x: 10, y: 10, width: 50, height: 50 },
          ],
        },
      ];

      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [0, 1],
          node: {
            id: "child2",
            type: "circle",
            x: 60,
            y: 10,
            width: 50,
            height: 50,
          },
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children![1].id).toBe("child2");
    });
  });

  describe("元数据测试", () => {
    it("应该收集变更元素信息", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "element2", type: "circle", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "set_node",
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 50 },
        },
        {
          type: "remove_node",
          path: [1],
          node: children[1],
        },
      ];

      const result = BoardOperations.applyOperations({ children }, operations);

      expect(result.metadata.changedElements).toHaveLength(1);
      expect(result.metadata.removedElements).toHaveLength(1);
      expect(result.metadata.hasChanges).toBe(true);
      expect(result.metadata.changedElements[0].id).toBe("element1");
      expect(result.metadata.removedElements[0].id).toBe("element2");
    });

    it("应该处理只读模式", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "set_node",
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 50 },
        },
        {
          type: "insert_node",
          path: [1],
          node: {
            id: "element2",
            type: "circle",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const result = BoardOperations.applyOperations({ children }, operations, {
        readonly: true,
      });

      // 只读模式下不应该有变化
      expect(result.data.children).toEqual(children);
      expect(result.metadata.hasChanges).toBe(false);
      expect(result.metadata.changedElements).toHaveLength(0);
    });
  });

  describe("viewPort 和 selection 操作", () => {
    it("应该处理 set_viewport 操作", () => {
      const data = {
        children: [] as BoardElement[],
        viewPort: { minX: 0, minY: 0, width: 100, height: 100, zoom: 1 },
      };

      const operations: Operation[] = [
        {
          type: "set_viewport",
          properties: { zoom: 1 },
          newProperties: { zoom: 1.5, minX: 100 },
        },
      ];

      const result = BoardOperations.applyOperations(data, operations);

      expect(result.data.viewPort!.zoom).toBe(1.5);
      expect(result.data.viewPort!.minX).toBe(100);
      expect(result.metadata.hasChanges).toBe(true);
    });

    it("应该处理 set_selection 操作", () => {
      const data = {
        children: [] as BoardElement[],
        selection: { selectedElements: [], selectArea: null },
      };

      const testElement = {
        id: "element1",
        type: "circle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      } as BoardElement;

      const operations: Operation[] = [
        {
          type: "set_selection",
          properties: { selectedElements: [] },
          newProperties: {
            selectedElements: [testElement],
            mode: "select",
          },
        },
      ];

      const result = BoardOperations.applyOperations(data, operations);

      expect(result.data.selection!.selectedElements).toEqual([testElement]);
      expect((result.data.selection as any).mode).toBe("select");
      expect(result.metadata.hasChanges).toBe(true);
    });

    it("应该跳过 viewPort 和 selection 操作当设置了 skip 选项", () => {
      const data = {
        children: [] as BoardElement[],
        viewPort: { zoom: 1, minX: 0, minY: 0, width: 100, height: 100 },
        selection: { selectedElements: [], selectArea: null },
      };

      const operations: Operation[] = [
        {
          type: "set_viewport",
          properties: {},
          newProperties: { zoom: 2 },
        },
        {
          type: "set_selection",
          properties: {},
          newProperties: {
            selectedElements: [
              {
                id: "element2",
                type: "circle",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
          },
        },
      ];

      const result = BoardOperations.applyOperations(data, operations, {
        skipViewPortOperations: true,
        skipSelectionOperations: true,
      });

      expect(result.data.viewPort!.zoom).toBe(1);
      expect(result.data.selection!.selectedElements).toEqual([]);
      expect(result.metadata.hasChanges).toBe(false);
    });
  });

  describe("预处理操作测试", () => {
    it("应该正确预处理操作", () => {
      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [0],
          node: {
            id: "element1",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "set_node",
          path: [1],
          properties: { x: 0 },
          newProperties: { x: 50 },
        },
      ];

      const processed = BoardOperations.preprocessOperations(operations);

      // 应该过滤、排序、转换操作
      expect(processed).toBeInstanceOf(Array);
      expect(processed.length).toBeGreaterThan(0);
    });

    it("应该处理空操作列表", () => {
      const processed = BoardOperations.preprocessOperations([]);
      expect(processed).toEqual([]);
    });
  });

  describe("边界情况测试", () => {
    it("应该处理空 children 数组", () => {
      const result = BoardOperations.applyToChildren(
        [],
        [
          {
            type: "insert_node",
            path: [0],
            node: {
              id: "element1",
              type: "rect",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
          },
        ],
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("element1");
    });

    it("应该处理无效路径", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      // 尝试在不存在的路径上操作
      const operations: Operation[] = [
        {
          type: "set_node",
          path: [5], // 无效路径
          properties: { x: 0 },
          newProperties: { x: 50 },
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      // 应该不会崩溃，原数据保持不变
      expect(result).toEqual(children);
    });

    it("应该处理索引超出范围的插入操作", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [5], // 超出范围的索引
          node: {
            id: "element2",
            type: "circle",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      // 应该不会插入元素，原数据保持不变
      expect(result).toEqual(children);
    });

    it("应该正确处理连续删除所有元素的操作", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "element2", type: "circle", x: 0, y: 0, width: 100, height: 100 },
      ];

      // 模拟 BoardUtil.diff 生成的删除操作序列
      // 这种序列会生成两个路径都是 [0] 的删除操作
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [0], // 删除第一个元素
          node: children[0],
        },
        {
          type: "remove_node",
          path: [0], // 删除第二个元素（现在位于索引 0）
          node: children[1],
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      // 应该正确删除所有元素，结果为空数组
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("应该正确处理连续删除操作的顺序变化", () => {
      const children: BoardElement[] = [
        { id: "element1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "element2", type: "circle", x: 0, y: 0, width: 100, height: 100 },
        { id: "element3", type: "text", x: 0, y: 0, width: 100, height: 100 },
      ];

      // 删除所有三个元素，都使用路径 [0]
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [0],
          node: children[0],
        },
        {
          type: "remove_node",
          path: [0],
          node: children[1],
        },
        {
          type: "remove_node",
          path: [0],
          node: children[2],
        },
      ];

      const result = BoardOperations.applyToChildren(children, operations);

      // 应该正确删除所有元素
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });
});
