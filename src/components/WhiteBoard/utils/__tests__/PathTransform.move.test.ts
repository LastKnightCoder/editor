import { describe, it, expect } from "vitest";
import { PathUtil } from "../PathUtil";
import type { Operation } from "../../types";

describe("Move操作路径转换测试（正确语义）", () => {
  describe("transformPath - Move操作：基本路径转换（根级）", () => {
    it("Move [2] -> [0]: 正确处理所有位置的影响", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [2],
        newPath: [0],
      };

      // [0] -> [1] (为插入腾出空间)
      expect(PathUtil.transformPath([0], moveOp)).toEqual([1]);

      // [1] -> [2] (为插入腾出空间)
      expect(PathUtil.transformPath([1], moveOp)).toEqual([2]);

      // [2] -> [0] (被移动的元素本身)
      expect(PathUtil.transformPath([2], moveOp)).toEqual([0]);

      // [3] -> [2] (填补删除的空间)
      expect(PathUtil.transformPath([3], moveOp)).toEqual([2]);
    });
  });

  describe("transformPath - Move操作：嵌套路径移动", () => {
    it("Move [0,2] -> [0,0]: 同父级内的移动", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [0, 2],
        newPath: [0, 0],
      };

      // 同父级内的影响
      expect(PathUtil.transformPath([0, 0], moveOp)).toEqual([0, 1]); // 为插入腾空间
      expect(PathUtil.transformPath([0, 1], moveOp)).toEqual([0, 2]); // 为插入腾空间
      expect(PathUtil.transformPath([0, 2], moveOp)).toEqual([0, 0]); // 被移动元素
      expect(PathUtil.transformPath([0, 3], moveOp)).toEqual([0, 2]); // 填补空间

      // 不同父级不受影响
      expect(PathUtil.transformPath([1, 0], moveOp)).toEqual([1, 0]);
      expect(PathUtil.transformPath([1, 1], moveOp)).toEqual([1, 1]);
      expect(PathUtil.transformPath([1, 2], moveOp)).toEqual([1, 2]);
    });
  });

  describe("transformPath - Move操作：跨层级移动", () => {
    it("Move [1,2,3] -> [0,1,0]: 跨层级移动", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [1, 2, 3],
        newPath: [0, 1, 0],
      };

      // 测试各种路径
      expect(PathUtil.transformPath([1, 2, 2], moveOp)).toEqual([1, 2, 2]); // 源路径同级，但在前面，不受删除影响
      expect(PathUtil.transformPath([1, 2, 3], moveOp)).toEqual([0, 1, 0]); // 被移动的元素
      expect(PathUtil.transformPath([1, 2, 4], moveOp)).toEqual([1, 2, 3]); // 源路径同级，删除影响
      expect(PathUtil.transformPath([0, 1, 0], moveOp)).toEqual([0, 1, 1]); // 目标路径同级，插入影响
      expect(PathUtil.transformPath([0, 1, 1], moveOp)).toEqual([0, 1, 2]); // 目标路径同级，插入影响

      // 无关路径
      expect(PathUtil.transformPath([0, 0, 0], moveOp)).toEqual([0, 0, 0]);
      expect(PathUtil.transformPath([1, 0], moveOp)).toEqual([1, 0]);
      expect(PathUtil.transformPath([2, 0], moveOp)).toEqual([2, 0]);
    });
  });

  describe("Move操作：向后移动 [1] -> [3]", () => {
    it("正确处理向后移动的影响", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [1],
        newPath: [3],
      };

      expect(PathUtil.transformPath([0], moveOp)).toEqual([0]); // 不受影响
      expect(PathUtil.transformPath([1], moveOp)).toEqual([3]); // 被移动元素
      expect(PathUtil.transformPath([2], moveOp)).toEqual([1]); // 向前移动填补
      expect(PathUtil.transformPath([3], moveOp)).toEqual([2]); // 向前移动填补
      expect(PathUtil.transformPath([4], moveOp)).toEqual([4]); // 不受影响
    });
  });

  describe("Move操作：同位置移动（无实际移动）", () => {
    it("同位置移动应该无影响", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [2],
        newPath: [2],
      };

      // 所有路径都不应该受影响
      expect(PathUtil.transformPath([0], moveOp)).toEqual([0]);
      expect(PathUtil.transformPath([1], moveOp)).toEqual([1]);
      expect(PathUtil.transformPath([2], moveOp)).toEqual([2]);
      expect(PathUtil.transformPath([3], moveOp)).toEqual([3]);
    });
  });

  describe("Move操作影响祖先路径重构", () => {
    it("Move操作影响子路径：被移动元素的子路径需要更新祖先部分", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [1, 2],
        newPath: [3, 0],
      };

      // 关键测试：被移动元素[1,2]的子路径需要重构
      expect(PathUtil.transformPath([1, 2], moveOp)).toEqual([3, 0]); // 被移动元素本身
      expect(PathUtil.transformPath([1, 2, 0], moveOp)).toEqual([3, 0, 0]); // 子路径：祖先[1,2]变成[3,0]
      expect(PathUtil.transformPath([1, 2, 1], moveOp)).toEqual([3, 0, 1]); // 子路径：祖先[1,2]变成[3,0]
      expect(PathUtil.transformPath([1, 2, 0, 5], moveOp)).toEqual([
        3, 0, 0, 5,
      ]); // 深层子路径

      // 同级路径受删除影响
      expect(PathUtil.transformPath([1, 3], moveOp)).toEqual([1, 2]); // [1,3] -> [1,2] (删除影响)

      // 目标同级路径受插入影响
      expect(PathUtil.transformPath([3, 0], moveOp)).toEqual([3, 1]); // [3,0] -> [3,1] (插入影响)

      // 无关路径不受影响
      expect(PathUtil.transformPath([0, 0], moveOp)).toEqual([0, 0]);
      expect(PathUtil.transformPath([2, 1], moveOp)).toEqual([2, 1]);
    });

    it("Move操作影响set_node路径：当set_node的目标在被移动元素的子路径下", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [0, 1],
        newPath: [2, 3],
      };

      // set_node的路径在被移动元素的子路径下，需要重构祖先路径
      expect(PathUtil.transformPath([0, 1, 0], moveOp)).toEqual([2, 3, 0]);
      expect(PathUtil.transformPath([0, 1, 2, 1], moveOp)).toEqual([
        2, 3, 2, 1,
      ]);

      // 不在子路径下的不受影响（除了同级影响）
      expect(PathUtil.transformPath([0, 0], moveOp)).toEqual([0, 0]); // 不是同级
      expect(PathUtil.transformPath([0, 2], moveOp)).toEqual([0, 1]); // 同级，删除影响
    });

    it("复杂的祖先路径重构测试", () => {
      const moveOp: Operation = {
        type: "move_node",
        path: [1],
        newPath: [0, 2],
      };

      // 根级元素[1]移动到[0,2]，其所有子路径都需要重构
      expect(PathUtil.transformPath([1], moveOp)).toEqual([0, 2]);
      expect(PathUtil.transformPath([1, 0], moveOp)).toEqual([0, 2, 0]);
      expect(PathUtil.transformPath([1, 1], moveOp)).toEqual([0, 2, 1]);
      expect(PathUtil.transformPath([1, 0, 0], moveOp)).toEqual([0, 2, 0, 0]);
      expect(PathUtil.transformPath([1, 1, 2, 3], moveOp)).toEqual([
        0, 2, 1, 2, 3,
      ]);

      // 其他根级元素受删除影响
      expect(PathUtil.transformPath([2], moveOp)).toEqual([1]); // [2] -> [1]
      expect(PathUtil.transformPath([3], moveOp)).toEqual([2]); // [3] -> [2]

      // 目标位置同级受插入影响
      expect(PathUtil.transformPath([0, 2], moveOp)).toEqual([0, 3]); // [0,2] -> [0,3]
      expect(PathUtil.transformPath([0, 3], moveOp)).toEqual([0, 4]); // [0,3] -> [0,4]

      // 无关路径不受影响
      expect(PathUtil.transformPath([0, 0], moveOp)).toEqual([0, 0]);
      expect(PathUtil.transformPath([0, 1], moveOp)).toEqual([0, 1]);
    });
  });
});
