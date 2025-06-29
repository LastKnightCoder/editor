import { describe, it, expect } from "vitest";
import { PathUtil } from "../PathUtil";
import type { Operation } from "../../types";

describe("transformPath - 单个路径转换核心测试", () => {
  describe("插入操作路径转换", () => {
    it("在位置0插入，后续路径应该+1", () => {
      const insertOp: Operation = {
        type: "insert_node",
        path: [0],
        node: { id: "new", type: "shape" },
      };

      const originalPath = [1];
      const result = PathUtil.transformPath(originalPath, insertOp);
      expect(result).toEqual([2]);
    });

    it("在位置1插入，位置0不受影响", () => {
      const insertOp: Operation = {
        type: "insert_node",
        path: [1],
        node: { id: "new", type: "shape" },
      };

      const originalPath = [0];
      const result = PathUtil.transformPath(originalPath, insertOp);
      expect(result).toEqual([0]);
    });

    it("多层路径插入：影响同级后续元素", () => {
      const insertOp: Operation = {
        type: "insert_node",
        path: [1, 0],
        node: { id: "new", type: "shape" },
      };

      const sameLevelPath = [1, 1];
      const result = PathUtil.transformPath(sameLevelPath, insertOp);
      expect(result).toEqual([1, 2]);

      const differentLevelPath = [0, 1];
      const result2 = PathUtil.transformPath(differentLevelPath, insertOp);
      expect(result2).toEqual([0, 1]);
    });
  });

  describe("删除操作路径转换", () => {
    it("删除位置0，后续路径应该-1", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [0],
        node: { id: "removed", type: "shape" },
      };

      const originalPath = [1];
      const result = PathUtil.transformPath(originalPath, removeOp);
      expect(result).toEqual([0]);
    });

    it("删除位置1，位置0不受影响", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [1],
        node: { id: "removed", type: "shape" },
      };

      const originalPath = [0];
      const result = PathUtil.transformPath(originalPath, removeOp);
      expect(result).toEqual([0]);
    });

    it("多层路径删除：不同分支的路径正确调整", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [0],
        node: { id: "removed", type: "shape" },
      };

      // 不同分支的路径第一层索引需要-1
      const differentBranchPath = [1, 1, 2];
      const result = PathUtil.transformPath(differentBranchPath, removeOp);
      expect(result).toEqual([0, 1, 2]);

      // 被删除分支的子路径保持不变（这里只测试transformPath，祖先删除检查在filterValidOperations中）
      const nestedPath = [0, 1, 2];
      const result2 = PathUtil.transformPath(nestedPath, removeOp);
      expect(result2).toEqual(null); // transformPath不处理祖先删除情况
    });
  });

  describe("Move操作路径转换", () => {
    it("同级向前移动：正确处理影响区间", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [2],
        newPath: [0],
      };

      // 被移动元素获得目标位置
      const result0 = PathUtil.transformPath([2], moveOp);
      expect(result0).toEqual([0]);

      // [0,1] 向后移动为[1,2]
      const result1 = PathUtil.transformPath([0], moveOp);
      expect(result1).toEqual([1]);

      const result2 = PathUtil.transformPath([1], moveOp);
      expect(result2).toEqual([2]);

      // [3] 不受影响
      const result3 = PathUtil.transformPath([3], moveOp);
      expect(result3).toEqual([3]);
    });

    it("同级向后移动：正确处理影响区间", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [0],
        newPath: [2],
      };

      // 被移动元素获得目标位置
      const result0 = PathUtil.transformPath([0], moveOp);
      expect(result0).toEqual([2]);

      // [1,2] 向前移动填补空间
      const result1 = PathUtil.transformPath([1], moveOp);
      expect(result1).toEqual([0]);

      const result2 = PathUtil.transformPath([2], moveOp);
      expect(result2).toEqual([1]);

      // [3] 不受影响
      const result3 = PathUtil.transformPath([3], moveOp);
      expect(result3).toEqual([3]);
    });

    it("跨级移动：源和目标分别处理", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [0, 1],
        newPath: [1, 0],
      };

      // 被移动元素
      const result0 = PathUtil.transformPath([0, 1], moveOp);
      expect(result0).toEqual([1, 0]);

      // 源路径同级：[0,2] -> [0,1]
      const result1 = PathUtil.transformPath([0, 2], moveOp);
      expect(result1).toEqual([0, 1]);

      // 目标路径同级：[1,0] -> [1,1]
      const result2 = PathUtil.transformPath([1, 0], moveOp);
      expect(result2).toEqual([1, 1]);

      // 无关路径不受影响
      const result3 = PathUtil.transformPath([2, 0], moveOp);
      expect(result3).toEqual([2, 0]);
    });

    it("同位置移动：无变化", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [1],
        newPath: [1],
      };

      const result = PathUtil.transformPath([1], moveOp);
      expect(result).toEqual([1]);

      const result2 = PathUtil.transformPath([0], moveOp);
      expect(result2).toEqual([0]);
    });
  });

  describe("删除和插入路径冲突场景", () => {
    it("相同路径的删除和插入：删除不影响插入", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [0],
        node: { id: "removed", type: "shape" },
      };

      // 相同路径的插入操作不应该受删除操作影响
      const insertPath = [0];
      const result = PathUtil.transformPath(
        insertPath,
        removeOp,
        "insert_node",
      );
      expect(result).toEqual([0]); // 应该保持原路径，不受删除影响
    });

    it("相同路径的删除和插入：多层路径场景", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [1, 2],
        node: { id: "removed", type: "shape" },
      };

      // 相同路径的插入操作不应该受删除操作影响
      const insertPath = [1, 2];
      const result = PathUtil.transformPath(
        insertPath,
        removeOp,
        "insert_node",
      );
      expect(result).toEqual([1, 2]); // 应该保持原路径
    });

    it("删除操作后续路径正确调整：避免负数索引", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [1],
        node: { id: "removed", type: "shape" },
      };

      // 位置0不受影响
      const result0 = PathUtil.transformPath([0], removeOp);
      expect(result0).toEqual([0]);

      // 位置1（被删除位置）应该返回null而不是负数
      const result1 = PathUtil.transformPath([1], removeOp);
      expect(result1).toEqual(null);

      // 位置2应该调整为1
      const result2 = PathUtil.transformPath([2], removeOp);
      expect(result2).toEqual([1]);
    });

    it("批量操作中删除和插入的组合：确保路径转换正确", () => {
      // 模拟批量操作场景：先删除[0]，再插入[0]
      const operations: Operation[] = [
        {
          type: "remove_node",
          path: [0],
          node: { id: "removed", type: "shape" },
        },
        {
          type: "insert_node",
          path: [0],
          node: { id: "new", type: "shape" },
        },
      ];

      // 第二个操作（插入[0]）不应该受第一个操作（删除[0]）影响
      const insertPath = [0];
      const firstOp = operations[0];

      const result = PathUtil.transformPath(insertPath, firstOp, "insert_node");
      expect(result).toEqual([0]); // 插入到相同位置应该保持不变
    });
  });

  describe("其他操作类型", () => {
    it("设置操作：不影响路径", () => {
      const setOp: Operation = {
        type: "set_node",
        path: [0],
        properties: { x: 10 },
        newProperties: { x: 20 },
      };

      const originalPath = [1];
      const result = PathUtil.transformPath(originalPath, setOp);
      expect(result).toEqual([1]);
    });

    it("视窗操作：不影响路径", () => {
      const viewportOp: Operation = {
        type: "set_viewport",
        properties: {},
        newProperties: {},
      };

      const originalPath = [1];
      const result = PathUtil.transformPath(originalPath, viewportOp);
      expect(result).toEqual([1]);
    });
  });
});
