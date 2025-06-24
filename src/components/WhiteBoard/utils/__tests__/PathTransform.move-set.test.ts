import { describe, it, expect } from "vitest";
import { PathUtil } from "../PathUtil";
import type {
  Operation,
  MoveNodeOperation,
  SetNodeOperation,
} from "../../types";

describe("Move和Set操作集成测试", () => {
  describe("祖先路径重构核心场景", () => {
    it("Move元素时，其子路径的Set操作需要重构祖先路径", () => {
      // 场景：移动[1,0]到[2,1]，同时设置[1,0,2]的属性
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [1, 0],
          newPath: [2, 1],
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [1, 0, 2], // 这个路径需要重构为[2,1,2]
          properties: { color: "blue" },
          newProperties: { color: "red" },
        } as SetNodeOperation,
      ];

      // 处理操作
      const validOps = PathUtil.filterValidOperations(operations);
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);
      const transformedOps = PathUtil.transformValidOperations(sortedOps);

      // 验证结果
      expect(transformedOps).toHaveLength(2);
      expect(transformedOps[0].type).toBe("move_node");
      expect((transformedOps[0] as any).path).toEqual([1, 0]);
      expect((transformedOps[0] as any).newPath).toEqual([2, 1]);

      expect(transformedOps[1].type).toBe("set_node");
      expect((transformedOps[1] as any).path).toEqual([2, 1, 2]); // 关键验证：路径被重构
    });

    it("Move根级元素时，所有子路径的Set操作都需要重构", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [0],
          newPath: [2, 0],
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [0, 1],
          properties: { visible: true },
          newProperties: { visible: false },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [0, 1, 3, 2],
          properties: { opacity: 1.0 },
          newProperties: { opacity: 0.5 },
        } as SetNodeOperation,
      ];

      const validOps = PathUtil.filterValidOperations(operations);
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);
      const transformedOps = PathUtil.transformValidOperations(sortedOps);

      expect(transformedOps).toHaveLength(3);

      // Move操作不变
      expect(transformedOps[0].type).toBe("move_node");
      expect((transformedOps[0] as any).path).toEqual([0]);
      expect((transformedOps[0] as any).newPath).toEqual([2, 0]);

      // 找到Set操作并验证路径重构
      const setOps = transformedOps.filter((op) => op.type === "set_node");
      const setPaths = setOps.map((op) => (op as any).path);

      // 验证路径重构结果
      expect(setPaths).toContainEqual([2, 0, 1]); // [0,1] -> [2,0,1]
      expect(setPaths).toContainEqual([2, 0, 1, 3, 2]); // [0,1,3,2] -> [2,0,1,3,2]
    });
  });

  describe("复杂场景测试", () => {
    it("Move操作对不同类型路径的影响：祖先重构、同级影响、无关路径", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [1, 2],
          newPath: [3, 0],
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [1, 2, 0], // 被移动元素的子路径，需要重构
          properties: { width: 50 },
          newProperties: { width: 100 },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [1, 1], // 无关路径，不受影响
          properties: { height: 80 },
          newProperties: { height: 200 },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [1, 3], // 同级路径，受删除影响 [1,3] -> [1,2]
          properties: { text: "old" },
          newProperties: { text: "hello" },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [3, 0], // 目标同级路径，受插入影响 [3,0] -> [3,1]
          properties: { border: "none" },
          newProperties: { border: "1px solid" },
        } as SetNodeOperation,
      ];

      const validOps = PathUtil.filterValidOperations(operations);
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);
      const transformedOps = PathUtil.transformValidOperations(sortedOps);

      expect(transformedOps).toHaveLength(5);

      // Move操作
      expect(transformedOps[0].type).toBe("move_node");
      expect((transformedOps[0] as any).path).toEqual([1, 2]);
      expect((transformedOps[0] as any).newPath).toEqual([3, 0]);

      // Set操作按不同影响分类验证
      const setOps = transformedOps.slice(1);
      const pathResults = setOps.map((op) => (op as any).path);

      expect(pathResults).toContainEqual([3, 0, 0]); // [1,2,0] -> [3,0,0] (祖先重构)
      expect(pathResults).toContainEqual([1, 1]); // [1,1] -> [1,1] (无影响)
      expect(pathResults).toContainEqual([1, 2]); // [1,3] -> [1,2] (删除影响)
      expect(pathResults).toContainEqual([3, 1]); // [3,0] -> [3,1] (插入影响)
    });

    it("深层嵌套Move操作的路径重构", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [1, 2, 3],
          newPath: [0, 1, 0],
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [1, 2, 3], // 被移动元素本身
          properties: { selected: false },
          newProperties: { selected: true },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [1, 2, 3, 0], // 被移动元素的子路径
          properties: { width: 50 },
          newProperties: { width: 100 },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [1, 2, 3, 1, 2], // 被移动元素的深层子路径
          properties: { height: 30 },
          newProperties: { height: 60 },
        } as SetNodeOperation,
      ];

      const validOps = PathUtil.filterValidOperations(operations);
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);
      const transformedOps = PathUtil.transformValidOperations(sortedOps);

      expect(transformedOps).toHaveLength(4);

      // 验证Set操作路径重构
      const setOps = transformedOps.filter((op) => op.type === "set_node");
      const setPaths = setOps.map((op) => (op as any).path);

      expect(setPaths).toContainEqual([0, 1, 0]); // [1,2,3] -> [0,1,0]
      expect(setPaths).toContainEqual([0, 1, 0, 0]); // [1,2,3,0] -> [0,1,0,0]
      expect(setPaths).toContainEqual([0, 1, 0, 1, 2]); // [1,2,3,1,2] -> [0,1,0,1,2]
    });

    it("复杂的同级移动对Set操作的影响", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [2],
          newPath: [0], // 向前移动
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [0], // 受插入影响 -> [1]
          properties: { index: 0 },
          newProperties: { index: 1 },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [1], // 受插入影响 -> [2]
          properties: { index: 1 },
          newProperties: { index: 2 },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [2], // 被移动元素 -> [0]
          properties: { index: 2 },
          newProperties: { index: 0 },
        } as SetNodeOperation,
        {
          type: "set_node",
          path: [3], // 受删除影响 -> [2]
          properties: { index: 3 },
          newProperties: { index: 2 },
        } as SetNodeOperation,
      ];

      const validOps = PathUtil.filterValidOperations(operations);
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);
      const transformedOps = PathUtil.transformValidOperations(sortedOps);

      expect(transformedOps).toHaveLength(5);

      // 验证Set操作的路径转换符合Move [2] -> [0]的影响
      const setOps = transformedOps.filter((op) => op.type === "set_node");
      const setPaths = setOps.map((op) => (op as any).path);

      expect(setPaths).toContainEqual([1]); // [0] -> [1] (插入影响)
      expect(setPaths).toContainEqual([2]); // [1] -> [2] (插入影响)
      expect(setPaths).toContainEqual([0]); // [2] -> [0] (被移动元素)
      expect(setPaths).toContainEqual([2]); // [3] -> [2] (删除影响)
    });
  });

  describe("边界情况和错误处理", () => {
    it("Set操作路径与Move操作路径完全相同", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [1, 2],
          newPath: [3, 0],
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [1, 2], // 与Move操作路径相同
          properties: { selected: false },
          newProperties: { selected: true },
        } as SetNodeOperation,
      ];

      const validOps = PathUtil.filterValidOperations(operations);
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);
      const transformedOps = PathUtil.transformValidOperations(sortedOps);

      expect(transformedOps).toHaveLength(2);

      // Set操作的路径应该更新为Move的目标路径
      const setOp = transformedOps.find((op) => op.type === "set_node");
      expect((setOp as any)?.path).toEqual([3, 0]);
    });

    it("验证Move-Set组合的幂等性", () => {
      const operations: Operation[] = [
        {
          type: "move_node",
          path: [1, 0],
          newPath: [2, 1],
        } as MoveNodeOperation,
        {
          type: "set_node",
          path: [1, 0, 2],
          properties: { value: 1 },
          newProperties: { value: 2 },
        } as SetNodeOperation,
      ];

      // 处理第一次
      const validOps1 = PathUtil.filterValidOperations(operations);
      const sortedOps1 = PathUtil.sortOperationsForExecution(validOps1);
      const transformedOps1 = PathUtil.transformValidOperations(sortedOps1);

      // 处理第二次（使用相同输入）
      const validOps2 = PathUtil.filterValidOperations(operations);
      const sortedOps2 = PathUtil.sortOperationsForExecution(validOps2);
      const transformedOps2 = PathUtil.transformValidOperations(sortedOps2);

      // 结果应该完全相同
      expect(transformedOps1).toEqual(transformedOps2);

      // 验证Set操作路径被正确重构
      const setOp = transformedOps1.find((op) => op.type === "set_node");
      expect((setOp as any)?.path).toEqual([2, 1, 2]);
    });
  });
});
