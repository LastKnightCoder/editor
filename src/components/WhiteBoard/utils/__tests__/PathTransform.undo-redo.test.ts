import { describe, it, expect } from "vitest";
import BoardUtil from "../BoardUtil";
import { BoardOperations } from "../BoardOperations";
import { BoardElement, Operation } from "../../types";

describe("PathTransform Undo/Redo Tests", () => {
  describe("逆操作生成测试", () => {
    it("应该为 insert_node 生成正确的逆操作", () => {
      const operation: Operation = {
        type: "insert_node",
        path: [1],
        node: {
          id: "test-id",
          type: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      };

      const inverse = BoardUtil.inverseOperation(operation);
      expect(inverse.type).toBe("remove_node");
      expect((inverse as any).path).toEqual([1]);
      expect((inverse as any).node).toEqual(operation.node);
    });

    it("应该为 remove_node 生成正确的逆操作", () => {
      const node: BoardElement = {
        id: "test-id",
        type: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      const operation: Operation = {
        type: "remove_node",
        path: [2],
        node,
      };

      const inverse = BoardUtil.inverseOperation(operation);
      expect(inverse.type).toBe("insert_node");
      expect((inverse as any).path).toEqual([2]);
      expect((inverse as any).node).toEqual(node);
    });

    it("应该为 move_node 生成正确的逆操作", () => {
      const operation: Operation = {
        type: "move_node",
        path: [1],
        newPath: [3],
      };

      const inverse = BoardUtil.inverseOperation(operation);
      expect(inverse.type).toBe("move_node");
      expect((inverse as any).path).toEqual([3]); // 交换源和目标
      expect((inverse as any).newPath).toEqual([1]);
    });

    it("应该为 set_node 生成正确的逆操作", () => {
      const operation: Operation = {
        type: "set_node",
        path: [0],
        properties: { x: 0, y: 0 },
        newProperties: { x: 100, y: 200 },
      };

      const inverse = BoardUtil.inverseOperation(operation);
      expect(inverse.type).toBe("set_node");
      expect((inverse as any).path).toEqual([0]);
      expect((inverse as any).properties).toEqual({ x: 100, y: 200 });
      expect((inverse as any).newProperties).toEqual({ x: 0, y: 0 });
    });
  });

  describe("基本 Undo/Redo 流程测试", () => {
    it("简单插入操作的 undo", () => {
      const initialChildren: BoardElement[] = [
        { id: "1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      const insertOp: Operation = {
        type: "insert_node",
        path: [1],
        node: { id: "2", type: "circle", x: 50, y: 50, width: 80, height: 80 },
      };

      // 执行插入
      const afterInsert = BoardOperations.applyToChildren(initialChildren, [
        insertOp,
      ]);
      expect(afterInsert).toHaveLength(2);
      expect(afterInsert[1].id).toBe("2");

      // 生成并执行 undo
      const undoOp = BoardUtil.inverseOperation(insertOp);
      const afterUndo = BoardOperations.applyToChildren(afterInsert, [undoOp]);

      expect(afterUndo).toEqual(initialChildren);
    });

    it("简单删除操作的 undo", () => {
      const initialChildren: BoardElement[] = [
        { id: "1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "2", type: "circle", x: 50, y: 50, width: 80, height: 80 },
      ];

      const removeOp: Operation = {
        type: "remove_node",
        path: [1],
        node: initialChildren[1],
      };

      // 执行删除
      const afterRemove = BoardOperations.applyToChildren(initialChildren, [
        removeOp,
      ]);
      expect(afterRemove).toHaveLength(1);
      expect(afterRemove[0].id).toBe("1");

      // 生成并执行 undo
      const undoOp = BoardUtil.inverseOperation(removeOp);
      const afterUndo = BoardOperations.applyToChildren(afterRemove, [undoOp]);

      expect(afterUndo).toEqual(initialChildren);
    });

    it("移动操作的 undo", () => {
      const initialChildren: BoardElement[] = [
        { id: "1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "2", type: "circle", x: 50, y: 50, width: 80, height: 80 },
        { id: "3", type: "line", x: 100, y: 100, width: 60, height: 60 },
      ];

      const moveOp: Operation = {
        type: "move_node",
        path: [2],
        newPath: [0],
      };

      // 执行移动
      const afterMove = BoardOperations.applyToChildren(initialChildren, [
        moveOp,
      ]);
      expect(afterMove[0].id).toBe("3"); // 移动到第一位
      expect(afterMove[1].id).toBe("1");
      expect(afterMove[2].id).toBe("2");

      // 生成并执行 undo
      const undoOp = BoardUtil.inverseOperation(moveOp);
      const afterUndo = BoardOperations.applyToChildren(afterMove, [undoOp]);

      expect(afterUndo).toEqual(initialChildren);
    });

    it("批量操作的 undo（逆序执行）", () => {
      const initialChildren: BoardElement[] = [
        { id: "1", type: "rect", x: 0, y: 0, width: 100, height: 100 },
      ];

      const operations: Operation[] = [
        {
          type: "insert_node",
          path: [1],
          node: {
            id: "2",
            type: "circle",
            x: 50,
            y: 50,
            width: 80,
            height: 80,
          },
        },
        {
          type: "set_node",
          path: [0],
          properties: { x: 0 },
          newProperties: { x: 10 },
        },
      ];

      // 执行批量操作
      const afterOps = BoardOperations.applyToChildren(
        initialChildren,
        operations,
      );
      expect(afterOps).toHaveLength(2);
      expect(afterOps[0].x).toBe(10);
      expect(afterOps[1].id).toBe("2");

      // 生成逆操作（逆序）
      const undoOps = operations
        .map((op) => BoardUtil.inverseOperation(op))
        .reverse();

      // 执行 undo
      const afterUndo = BoardOperations.applyToChildren(afterOps, undoOps);
      expect(afterUndo).toEqual(initialChildren);
    });
  });

  describe("复杂场景 Undo 测试", () => {
    it("混合操作序列的完整 undo/redo", () => {
      const initialState: BoardElement[] = [
        { id: "a", type: "rect", x: 0, y: 0, width: 100, height: 100 },
        { id: "b", type: "circle", x: 50, y: 50, width: 80, height: 80 },
      ];

      const operations: Operation[] = [
        // 1. 删除第二个元素
        {
          type: "remove_node",
          path: [1],
          node: initialState[1],
        },
        // 2. 修改第一个元素
        {
          type: "set_node",
          path: [0],
          properties: { x: 0, y: 0 },
          newProperties: { x: 20, y: 30 },
        },
        // 3. 添加新元素
        {
          type: "insert_node",
          path: [1],
          node: {
            id: "c",
            type: "line",
            x: 100,
            y: 100,
            width: 60,
            height: 60,
          },
        },
      ];

      // 执行正向操作
      const finalState = BoardOperations.applyToChildren(
        initialState,
        operations,
      );
      expect(finalState).toHaveLength(2);
      expect(finalState[0].x).toBe(20);
      expect(finalState[1].id).toBe("c");

      // 执行完整 undo
      const undoOps = operations
        .map((op) => BoardUtil.inverseOperation(op))
        .reverse();

      const undoState = BoardOperations.applyToChildren(finalState, undoOps);
      expect(undoState).toEqual(initialState);

      // 执行 redo
      const redoState = BoardOperations.applyToChildren(undoState, operations);
      expect(redoState).toEqual(finalState);
    });
  });
});
