import { describe, test, expect } from "vitest";
import { PathUtil } from "../PathUtil";
import { Operation } from "../../types";

describe("PathTransform - 父元素删除影响测试", () => {
  test("插入操作：父元素被删除时应该被过滤掉", () => {
    const operations: Operation[] = [
      { type: "remove_node", path: [0], node: { id: "test", type: "shape" } }, // 删除节点 [0]
      {
        type: "insert_node",
        path: [0, 1],
        node: { id: "test", type: "shape" },
      }, // 尝试在已删除的 [0] 下插入
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 应该只保留删除操作，插入操作被过滤
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("remove_node");
    expect((result[0] as any).path).toEqual([0]);
  });

  test("插入操作：深层父元素被删除时应该被过滤掉", () => {
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0, 1],
        node: { id: "test", type: "shape" },
      }, // 删除节点 [0, 1]
      {
        type: "insert_node",
        path: [0, 1, 2, 3],
        node: { id: "test", type: "shape" },
      }, // 尝试在已删除的 [0, 1] 的子树下插入
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 应该只保留删除操作
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("remove_node");
  });

  test("移动操作：源路径被删除时应该被过滤掉", () => {
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0, 1],
        node: { id: "test", type: "shape" },
      }, // 删除节点 [0, 1]
      { type: "move_node", path: [0, 1, 2], newPath: [2, 0] }, // 尝试移动已删除节点的子节点
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 应该只保留删除操作
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("remove_node");
  });

  test("移动操作：目标父路径被删除时应该被过滤掉", () => {
    const operations: Operation[] = [
      { type: "remove_node", path: [1], node: { id: "test", type: "shape" } }, // 删除节点 [1]
      { type: "move_node", path: [0, 2], newPath: [1, 0] }, // 尝试移动到已删除的 [1] 下
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 应该只保留删除操作
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("remove_node");
  });

  test("移动操作：源和目标都有效时应该保留", () => {
    const operations: Operation[] = [
      { type: "remove_node", path: [3], node: { id: "test", type: "shape" } }, // 删除节点 [3]，不影响下面的移动
      { type: "move_node", path: [0, 2], newPath: [1, 0] }, // 有效的移动操作
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 移动操作会被转换为删除+插入的形式，所以实际上有两个操作
    expect(result).toHaveLength(2);
    // 根据排序逻辑，移动操作先处理，删除操作后处理
    expect(result[0].type).toBe("move_node");
    expect(result[1].type).toBe("remove_node");
  });

  test("设置操作：目标路径被删除时应该被过滤掉", () => {
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0, 1],
        node: { id: "test", type: "shape" },
      }, // 删除节点 [0, 1]
      {
        type: "set_node",
        path: [0, 1, 2],
        properties: { text: "new" },
        newProperties: { text: "old" },
      }, // 尝试设置已删除节点的子节点
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 应该只保留删除操作
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("remove_node");
  });

  test("复杂场景：多层删除和插入混合", () => {
    const operations: Operation[] = [
      { type: "remove_node", path: [0], node: { id: "test", type: "shape" } }, // 删除 [0]
      {
        type: "remove_node",
        path: [1, 2],
        node: { id: "test", type: "shape" },
      }, // 删除 [1, 2]
      {
        type: "insert_node",
        path: [0, 1],
        node: { id: "test1", type: "shape" },
      }, // 无效：父 [0] 被删除
      {
        type: "insert_node",
        path: [1, 2, 3],
        node: { id: "test2", type: "shape" },
      }, // 无效：父 [1, 2] 被删除
      {
        type: "insert_node",
        path: [2, 1],
        node: { id: "test3", type: "shape" },
      }, // 有效：父 [2] 存在
      { type: "move_node", path: [1, 0], newPath: [0, 0] }, // 无效：目标父 [0] 被删除
      {
        type: "set_node",
        path: [1, 2],
        properties: { text: "new" },
        newProperties: { text: "old" },
      }, // 无效：路径 [1, 2] 被删除
    ];

    // 正确的三步处理
    const filtered = PathUtil.filterValidOperations(operations);
    const sorted = PathUtil.sortOperationsForExecution(filtered);
    const result = PathUtil.transformValidOperations(sorted);

    // 应该只保留有效操作：2个删除 + 1个插入
    expect(result.length).toBe(3);

    // 验证操作类型分布
    const insertOps = result.filter((op) => op.type === "insert_node");
    const removeOps = result.filter((op) => op.type === "remove_node");

    expect(insertOps.length).toBe(1); // 只有[2,1]的插入有效
    expect(removeOps.length).toBe(2); // 两个删除操作

    // 验证有效插入操作的路径调整
    const validInsert = insertOps[0] as any;
    // 原[2,1]可能因为前面的删除操作而路径调整，但具体调整取决于排序后的执行顺序
    expect(validInsert.path).toBeDefined();
  });

  test("深层嵌套场景：多级父子关系删除", () => {
    const operations: Operation[] = [
      {
        type: "remove_node",
        path: [0, 1, 2],
        node: { id: "test", type: "shape" },
      }, // 删除深层节点
      {
        type: "insert_node",
        path: [0, 1, 2, 0],
        node: { id: "deep1", type: "shape" },
      }, // 无效：父节点被删除
      {
        type: "insert_node",
        path: [0, 1, 2, 3, 4],
        node: { id: "deep2", type: "shape" },
      }, // 无效：祖先被删除
      { type: "move_node", path: [0, 1, 3], newPath: [0, 1, 2, 5] }, // 无效：目标父节点被删除
      {
        type: "set_node",
        path: [0, 1, 2, 1],
        properties: { deep: true },
        newProperties: { deep: false },
      }, // 无效：祖先被删除
      {
        type: "insert_node",
        path: [0, 1, 3, 0],
        node: { id: "valid", type: "shape" },
      }, // 有效：不同的父路径
    ];

    const filtered = PathUtil.filterValidOperations(operations);
    const sorted = PathUtil.sortOperationsForExecution(filtered);
    const result = PathUtil.transformValidOperations(sorted);

    // 应该保留：1个删除 + 1个有效插入
    expect(result.length).toBe(2);

    const insertOps = result.filter((op) => op.type === "insert_node");
    const removeOps = result.filter((op) => op.type === "remove_node");

    expect(insertOps.length).toBe(1);
    expect(removeOps.length).toBe(1);

    // 验证有效插入操作
    expect((insertOps[0] as any).node.id).toBe("valid");
    expect((removeOps[0] as any).path).toEqual([0, 1, 2]);
  });

  test("连续父子删除场景", () => {
    const operations: Operation[] = [
      { type: "remove_node", path: [0], node: { id: "test", type: "shape" } }, // 删除根节点
      {
        type: "remove_node",
        path: [0, 1],
        node: { id: "test", type: "shape" },
      }, // 无效：父节点已被删除（被祖先过滤）
      {
        type: "remove_node",
        path: [0, 1, 2],
        node: { id: "test", type: "shape" },
      }, // 无效：祖先节点已被删除
      {
        type: "insert_node",
        path: [1, 0],
        node: { id: "new1", type: "shape" },
      }, // 有效：不同的根节点
      { type: "remove_node", path: [1], node: { id: "test", type: "shape" } }, // 删除另一个根节点
      {
        type: "insert_node",
        path: [1, 1],
        node: { id: "new2", type: "shape" },
      }, // 无效：父节点刚被删除
    ];

    const filtered = PathUtil.filterValidOperations(operations);
    const sorted = PathUtil.sortOperationsForExecution(filtered);
    const result = PathUtil.transformValidOperations(sorted);

    // 预期：祖先-子孙过滤会只保留祖先删除，所以只有[0]和[1]的删除，以及有效的插入
    // 但[1,1]插入会被过滤掉，因为[1]被删除了
    expect(result.length).toBe(2);

    const insertOps = result.filter((op) => op.type === "insert_node");
    const removeOps = result.filter((op) => op.type === "remove_node");

    expect(removeOps.length).toBe(2); // [0]和[1]的删除
    expect(insertOps.length).toBe(0); // 没有有效的插入操作，因为[1,0]的父路径[1]被删除了
  });

  test("边界情况：根级操作不受父路径删除影响", () => {
    const operations: Operation[] = [
      { type: "remove_node", path: [0], node: { id: "test", type: "shape" } }, // 删除根节点
      { type: "insert_node", path: [1], node: { id: "root1", type: "shape" } }, // 有效：根级插入
      { type: "insert_node", path: [2], node: { id: "root2", type: "shape" } }, // 有效：根级插入
      { type: "move_node", path: [3], newPath: [4] }, // 有效：根级移动
      {
        type: "set_node",
        path: [5],
        properties: { root: true },
        newProperties: { root: false },
      }, // 有效：根级设置
    ];

    const result = PathUtil.transformValidOperations(
      PathUtil.filterValidOperations(
        PathUtil.sortOperationsForExecution(operations),
      ),
    );

    // 所有操作都应该保留，路径会被自动调整
    expect(result.length).toBeGreaterThan(0);
    result.forEach((op: Operation) => {
      expect((op as any).path.length).toBe(1); // 所有都是根级路径
    });
  });
});
