import { describe, it, expect } from "vitest";
import PathUtil from "../PathUtil";
import { Operation } from "../../types";

describe("SortOperations Tests", () => {
  describe("插入操作排序", () => {
    it("应该按深度从浅到深排序插入操作", () => {
      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [0, 1, 2], // 深度 3
          node: {
            id: "deep",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "insert_node",
          path: [0], // 深度 1
          node: {
            id: "shallow",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "insert_node",
          path: [0, 1], // 深度 2
          node: {
            id: "medium",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      expect((sorted[0] as any).path).toEqual([0]); // 最浅的先执行
      expect((sorted[1] as any).path).toEqual([0, 1]);
      expect((sorted[2] as any).path).toEqual([0, 1, 2]); // 最深的最后执行
    });

    it("相同深度的插入操作保持原始顺序", () => {
      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [2],
          node: {
            id: "second",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "insert_node",
          path: [0],
          node: {
            id: "first",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "insert_node",
          path: [1],
          node: {
            id: "third",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 相同深度时保持原始顺序
      expect((sorted[0] as any).node.id).toBe("second");
      expect((sorted[1] as any).node.id).toBe("first");
      expect((sorted[2] as any).node.id).toBe("third");
    });
  });

  describe("非插入操作排序", () => {
    it("非插入操作应该保持原始顺序", () => {
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [2],
          node: {
            id: "remove2",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "set_node",
          path: [0],
          properties: {},
          newProperties: { x: 100 },
        },
        {
          type: "remove_node",
          path: [1],
          node: {
            id: "remove1",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 非插入操作保持原始顺序
      expect(sorted[0].type).toBe("remove_node");
      expect((sorted[0] as any).path).toEqual([2]);
      expect(sorted[1].type).toBe("set_node");
      expect(sorted[2].type).toBe("remove_node");
      expect((sorted[2] as any).path).toEqual([1]);
    });

    it("move 操作应该保持原始顺序", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [2],
          newPath: [0],
        },
        {
          type: "move_node",
          path: [1],
          newPath: [3],
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      expect((sorted[0] as any).path).toEqual([2]);
      expect((sorted[1] as any).path).toEqual([1]);
    });
  });

  describe("混合操作排序", () => {
    it("应该只对插入操作排序，其他操作保持原始顺序", () => {
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [1],
          node: {
            id: "remove",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "insert_node",
          path: [0, 1], // 深度 2
          node: {
            id: "deep-insert",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "set_node",
          path: [0],
          properties: {},
          newProperties: { x: 100 },
        },
        {
          type: "insert_node",
          path: [0], // 深度 1
          node: {
            id: "shallow-insert",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {
          type: "move_node",
          path: [2],
          newPath: [3],
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 验证插入操作被正确排序（深度从浅到深）
      const insertOps = sorted.filter((op) => op.type === "insert_node");

      expect(insertOps).toHaveLength(2);
      expect((insertOps[0] as any).path).toEqual([0]); // 浅层先执行
      expect((insertOps[1] as any).path).toEqual([0, 1]); // 深层后执行

      // 验证排序后的整体顺序
      // 插入操作会被重新排序，但非插入操作保持原始顺序
      expect(sorted[0].type).toBe("remove_node");
      expect(sorted[1].type).toBe("insert_node");
      expect((sorted[1] as any).path).toEqual([0]); // 浅层插入先执行
      expect(sorted[2].type).toBe("set_node");
      expect(sorted[3].type).toBe("insert_node");
      expect((sorted[3] as any).path).toEqual([0, 1]); // 深层插入后执行
      expect(sorted[4].type).toBe("move_node");
    });

    it("空操作数组应该返回空数组", () => {
      const operations: Operation[] = [];
      const sorted = PathUtil.sortOperationsForExecution(operations);
      expect(sorted).toEqual([]);
    });

    it("单个操作应该直接返回", () => {
      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [0],
          node: {
            id: "single",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);
      expect(sorted).toEqual(operations);
    });
  });

  describe("实际场景排序", () => {
    it("确保父元素在子元素之前插入", () => {
      const operations: Operation[] = [
        // 子元素插入
        {
          type: "insert_node",
          path: [0, 0],
          node: {
            id: "child",
            type: "rect",
            x: 10,
            y: 10,
            width: 50,
            height: 50,
          },
        },
        // 父元素插入
        {
          type: "insert_node",
          path: [0],
          node: {
            id: "parent",
            type: "group",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            children: [],
          },
        },
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 父元素应该先插入
      expect((sorted[0] as any).path).toEqual([0]);
      expect((sorted[0] as any).node.id).toBe("parent");

      // 子元素应该后插入
      expect((sorted[1] as any).path).toEqual([0, 0]);
      expect((sorted[1] as any).node.id).toBe("child");
    });
  });
});
