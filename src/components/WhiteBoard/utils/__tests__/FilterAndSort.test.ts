import { describe, it, expect } from "vitest";
import { PathUtil } from "../PathUtil";
import type {
  Operation,
  InsertNodeOperation,
  RemoveNodeOperation,
  SetNodeOperation,
  SetViewportOperation,
} from "../../types";

describe("操作过滤和排序算法测试", () => {
  describe("祖先-子孙关系过滤测试", () => {
    it("应该在 filterValidOperations 中过滤冗余的子孙删除操作", () => {
      const operations: Operation[] = [
        // 删除父节点
        {
          type: "remove_node",
          path: [0],
          node: { id: "parent", type: "group" },
        } as RemoveNodeOperation,
        // 删除子节点（冗余）
        {
          type: "remove_node",
          path: [0, 1],
          node: { id: "child", type: "rect" },
        } as RemoveNodeOperation,
        // 删除孙子节点（冗余）
        {
          type: "remove_node",
          path: [0, 1, 2],
          node: { id: "grandchild", type: "text" },
        } as RemoveNodeOperation,
        // 不相关的删除操作（保留）
        {
          type: "remove_node",
          path: [1],
          node: { id: "unrelated", type: "circle" },
        } as RemoveNodeOperation,
      ];

      const filtered = PathUtil.filterValidOperations(operations);
      const removeOps = filtered.filter((op) => op.type === "remove_node");

      // 应该只保留父节点删除和不相关的删除操作
      expect(removeOps).toHaveLength(2);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "parent",
        ),
      ).toBe(true);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "unrelated",
        ),
      ).toBe(true);
      expect(
        removeOps.some((op) => (op as RemoveNodeOperation).node.id === "child"),
      ).toBe(false);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "grandchild",
        ),
      ).toBe(false);
    });

    it("应该正确识别多层嵌套的祖先-子孙关系", () => {
      const operations: Operation[] = [
        // 删除深层子孙节点（冗余）
        {
          type: "remove_node",
          path: [0, 1, 2, 3, 4],
          node: { id: "deep-descendant", type: "text" },
        } as RemoveNodeOperation,
        // 删除中层祖先节点
        {
          type: "remove_node",
          path: [0, 1],
          node: { id: "mid-ancestor", type: "group" },
        } as RemoveNodeOperation,
        // 删除更深的子孙节点（冗余）
        {
          type: "remove_node",
          path: [0, 1, 2, 3],
          node: { id: "another-descendant", type: "rect" },
        } as RemoveNodeOperation,
        // 删除根节点
        {
          type: "remove_node",
          path: [0],
          node: { id: "root-ancestor", type: "board" },
        } as RemoveNodeOperation,
        // 不相关的分支（保留）
        {
          type: "remove_node",
          path: [1, 0, 2],
          node: { id: "different-branch", type: "circle" },
        } as RemoveNodeOperation,
      ];

      const filtered = PathUtil.filterValidOperations(operations);
      const removeOps = filtered.filter((op) => op.type === "remove_node");

      // 应该只保留根祖先和不相关分支的删除操作
      expect(removeOps).toHaveLength(2);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "root-ancestor",
        ),
      ).toBe(true);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "different-branch",
        ),
      ).toBe(true);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "mid-ancestor",
        ),
      ).toBe(false);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "deep-descendant",
        ),
      ).toBe(false);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "another-descendant",
        ),
      ).toBe(false);
    });

    it("应该保留兄弟节点的删除操作", () => {
      const operations: Operation[] = [
        // 删除兄弟节点1
        {
          type: "remove_node",
          path: [0, 1],
          node: { id: "sibling-1", type: "rect" },
        } as RemoveNodeOperation,
        // 删除兄弟节点2
        {
          type: "remove_node",
          path: [0, 2],
          node: { id: "sibling-2", type: "rect" },
        } as RemoveNodeOperation,
        // 删除兄弟节点3
        {
          type: "remove_node",
          path: [0, 0],
          node: { id: "sibling-0", type: "rect" },
        } as RemoveNodeOperation,
      ];

      const filtered = PathUtil.filterValidOperations(operations);
      const removeOps = filtered.filter((op) => op.type === "remove_node");

      // 兄弟节点之间没有祖先-子孙关系，都应该保留
      expect(removeOps).toHaveLength(3);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "sibling-1",
        ),
      ).toBe(true);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "sibling-2",
        ),
      ).toBe(true);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "sibling-0",
        ),
      ).toBe(true);
    });
  });

  describe("操作执行排序测试", () => {
    it("应该对插入操作按深度从浅到深排序", () => {
      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [1, 2], // 深层插入
          node: { id: "deep-item", type: "text" },
        } as InsertNodeOperation,
        {
          type: "insert_node",
          path: [0], // 浅层插入
          node: { id: "shallow-item", type: "group" },
        } as InsertNodeOperation,
        {
          type: "insert_node",
          path: [1, 0], // 中层插入
          node: { id: "mid-item", type: "rect" },
        } as InsertNodeOperation,
        {
          type: "insert_node",
          path: [2], // 根级插入
          node: { id: "root-item", type: "group" },
        } as InsertNodeOperation,
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 验证插入操作按深度从浅到深排序（父节点先插入）
      const insertOps = sorted.filter((op) => op.type === "insert_node");
      expect(insertOps).toHaveLength(4);

      // 深度1的操作（根级）
      expect((insertOps[0] as InsertNodeOperation).path).toEqual([0]);
      expect((insertOps[1] as InsertNodeOperation).path).toEqual([2]);

      // 深度2的操作（同深度按索引排序）
      expect((insertOps[2] as InsertNodeOperation).path).toEqual([1, 0]);
      expect((insertOps[3] as InsertNodeOperation).path).toEqual([1, 2]);
    });

    it("应该对删除操作按深度从深到浅，同层按索引从大到小排序", () => {
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [0],
          node: { id: "item-0", type: "rect" },
        } as RemoveNodeOperation,
        {
          type: "remove_node",
          path: [3],
          node: { id: "item-3", type: "rect" },
        } as RemoveNodeOperation,
        {
          type: "remove_node",
          path: [1],
          node: { id: "item-1", type: "rect" },
        } as RemoveNodeOperation,
        {
          type: "remove_node",
          path: [2],
          node: { id: "item-2", type: "rect" },
        } as RemoveNodeOperation,
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 删除操作应该按索引从大到小排序
      const removeOps = sorted.filter((op) => op.type === "remove_node");
      expect(removeOps).toHaveLength(4);
      expect((removeOps[0] as RemoveNodeOperation).path).toEqual([3]);
      expect((removeOps[1] as RemoveNodeOperation).path).toEqual([2]);
      expect((removeOps[2] as RemoveNodeOperation).path).toEqual([1]);
      expect((removeOps[3] as RemoveNodeOperation).path).toEqual([0]);
    });

    it("应该按正确顺序排列不同类型的操作", () => {
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [1],
          node: { id: "remove-item", type: "rect" },
        } as RemoveNodeOperation,
        {
          type: "set_node",
          path: [0, 1],
          properties: { color: "red" },
          newProperties: { color: "blue" },
        } as SetNodeOperation,
        {
          type: "insert_node",
          path: [0],
          node: { id: "insert-item", type: "group" },
        } as InsertNodeOperation,
        {
          type: "set_viewport",
          properties: { zoom: 1 },
          newProperties: { zoom: 2 },
        } as SetViewportOperation,
      ];

      const sorted = PathUtil.sortOperationsForExecution(operations);

      // 验证操作顺序：其他操作 -> 插入操作 -> 设置操作 -> 删除操作
      expect(sorted).toHaveLength(4);
      expect(sorted[0].type).toBe("set_viewport"); // 其他操作
      expect(sorted[1].type).toBe("insert_node"); // 插入操作
      expect(sorted[2].type).toBe("set_node"); // 设置操作
      expect(sorted[3].type).toBe("remove_node"); // 删除操作
    });
  });

  describe("综合功能测试", () => {
    it("过滤和排序的组合应用", () => {
      const operations: Operation[] = [
        // 设置操作（不受删除影响的路径）
        {
          type: "set_node",
          path: [3, 1],
          properties: { color: "red" },
          newProperties: { color: "blue" },
        } as SetNodeOperation,
        // 删除操作（会被祖先过滤）
        {
          type: "remove_node",
          path: [0, 1, 2],
          node: { id: "child-will-be-filtered", type: "text" },
        } as RemoveNodeOperation,
        // 插入操作
        {
          type: "insert_node",
          path: [1, 0, 2],
          node: { id: "deep-insert", type: "circle" },
        } as InsertNodeOperation,
        // 删除祖先操作
        {
          type: "remove_node",
          path: [0],
          node: { id: "ancestor-parent", type: "group" },
        } as RemoveNodeOperation,
        // 另一个删除操作（保留）
        {
          type: "remove_node",
          path: [2],
          node: { id: "independent-delete", type: "rect" },
        } as RemoveNodeOperation,
        // 浅层插入
        {
          type: "insert_node",
          path: [1],
          node: { id: "shallow-insert", type: "group" },
        } as InsertNodeOperation,
      ];

      // 第一步：过滤有效操作
      const filtered = PathUtil.filterValidOperations(operations);
      // 预期被过滤的操作：
      // 1. 删除 [0,1,2] 因为 [0] 被删除了（祖先-子孙关系）
      expect(filtered).toHaveLength(5); // 1个删除操作被过滤掉

      // 第二步：排序操作
      const sorted = PathUtil.sortOperationsForExecution(filtered);

      // 验证操作分类和排序
      expect(sorted).toHaveLength(5);

      // 插入操作应该按深度浅到深排序
      const insertOps = sorted.filter((op) => op.type === "insert_node");
      expect(insertOps).toHaveLength(2);
      expect((insertOps[0] as InsertNodeOperation).path).toEqual([1]); // 深度1
      expect((insertOps[1] as InsertNodeOperation).path).toEqual([1, 0, 2]); // 深度3

      // 设置操作
      const setOps = sorted.filter((op) => op.type === "set_node");
      expect(setOps).toHaveLength(1);

      // 删除操作应该按倒序排列
      const removeOps = sorted.filter((op) => op.type === "remove_node");
      expect(removeOps).toHaveLength(2);
      expect((removeOps[0] as RemoveNodeOperation).path).toEqual([2]); // 索引大的先删除
      expect((removeOps[1] as RemoveNodeOperation).path).toEqual([0]);

      // 验证祖先-子孙过滤生效
      expect(
        removeOps.some(
          (op) =>
            (op as RemoveNodeOperation).node.id === "child-will-be-filtered",
        ),
      ).toBe(false);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "ancestor-parent",
        ),
      ).toBe(true);
      expect(
        removeOps.some(
          (op) => (op as RemoveNodeOperation).node.id === "independent-delete",
        ),
      ).toBe(true);
    });
  });

  describe("边界情况测试", () => {
    it("空操作列表", () => {
      const operations: Operation[] = [];
      const filtered = PathUtil.filterValidOperations(operations);
      const sorted = PathUtil.sortOperationsForExecution(filtered);
      expect(sorted).toHaveLength(0);
    });

    it("只有祖先删除操作", () => {
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [0],
          node: { id: "parent", type: "group" },
        } as RemoveNodeOperation,
        {
          type: "remove_node",
          path: [0, 1],
          node: { id: "child", type: "rect" },
        } as RemoveNodeOperation,
      ];

      const filtered = PathUtil.filterValidOperations(operations);
      const removeOps = filtered.filter((op) => op.type === "remove_node");

      expect(removeOps).toHaveLength(1);
      expect((removeOps[0] as RemoveNodeOperation).node.id).toBe("parent");
    });
  });
});
