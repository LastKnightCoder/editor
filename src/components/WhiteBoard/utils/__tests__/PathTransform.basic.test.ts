import { describe, it, expect } from "vitest";
import { PathUtil } from "../PathUtil";
import { Operation } from "../../types";

describe("路径转换基础功能测试", () => {
  describe("transformPath - 单个路径转换", () => {
    it("插入操作：在位置0插入，后续路径应该+1", () => {
      const insertOp: Operation = {
        type: "insert_node",
        path: [0],
        node: { id: "new", type: "shape" },
      };

      expect(PathUtil.transformPath([0], insertOp)).toEqual([1]);
      expect(PathUtil.transformPath([1], insertOp)).toEqual([2]);
      expect(PathUtil.transformPath([2], insertOp)).toEqual([3]);
    });

    it("插入操作：在位置1插入，位置0不受影响", () => {
      const insertOp: Operation = {
        type: "insert_node",
        path: [1],
        node: { id: "new", type: "shape" },
      };

      expect(PathUtil.transformPath([0], insertOp)).toEqual([0]);
      expect(PathUtil.transformPath([1], insertOp)).toEqual([2]);
      expect(PathUtil.transformPath([2], insertOp)).toEqual([3]);
    });

    it("删除操作：删除位置0，后续路径应该-1", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [0],
        node: { id: "deleted", type: "shape" },
      };

      expect(PathUtil.transformPath([0], removeOp)).toEqual(null); // 被删除的元素本身
      expect(PathUtil.transformPath([1], removeOp)).toEqual([0]);
      expect(PathUtil.transformPath([2], removeOp)).toEqual([1]);
    });

    it("删除操作：操作已经被删除的元素，无效", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [1],
        node: { id: "deleted", type: "shape" },
      };

      expect(PathUtil.transformPath([0], removeOp)).toEqual([0]);
      expect(PathUtil.transformPath([1], removeOp)).toEqual(null);
      expect(PathUtil.transformPath([2], removeOp)).toEqual([1]);
      expect(PathUtil.transformPath([3], removeOp)).toEqual([2]);
    });

    it("设置操作：不应该影响路径", () => {
      const setOp: Operation = {
        type: "set_node",
        path: [1],
        properties: { color: "red" },
        newProperties: { color: "blue" },
      };

      expect(PathUtil.transformPath([0], setOp)).toEqual([0]);
      expect(PathUtil.transformPath([1], setOp)).toEqual([1]);
      expect(PathUtil.transformPath([2], setOp)).toEqual([2]);
    });

    it("无路径的操作：应该返回原路径", () => {
      const viewportOp: Operation = {
        type: "set_viewport",
        properties: { zoom: 1 },
        newProperties: { zoom: 2 },
      };

      expect(PathUtil.transformPath([0], viewportOp)).toEqual([0]);
      expect(PathUtil.transformPath([1, 2], viewportOp)).toEqual([1, 2]);
    });

    it("多层路径：跨层级删除的正确影响", () => {
      const removeOp: Operation = {
        type: "remove_node",
        path: [0],
        node: { id: "root-deleted", type: "shape" },
      };

      // 根据跨层级影响算法，删除[0]会影响[1,2,3]的第一层索引
      expect(PathUtil.transformPath([1, 2, 3], removeOp)).toEqual([0, 2, 3]);
      // 而[0,1,2]中的[0]被删除了，子路径无法访问，但transformPath只处理索引调整
      expect(PathUtil.transformPath([0, 1, 2], removeOp)).toEqual([0, 1, 2]);
    });

    it("不同层级的插入：应该正确处理", () => {
      const insertOp: Operation = {
        type: "insert_node",
        path: [1, 0],
        node: { id: "nested-insert", type: "shape" },
      };

      expect(PathUtil.transformPath([0], insertOp)).toEqual([0]); // 不同层级
      expect(PathUtil.transformPath([1], insertOp)).toEqual([1]); // 不同层级
      expect(PathUtil.transformPath([1, 0], insertOp)).toEqual([1, 1]); // 同层级
      expect(PathUtil.transformPath([1, 1], insertOp)).toEqual([1, 2]); // 同层级
    });
  });
});
