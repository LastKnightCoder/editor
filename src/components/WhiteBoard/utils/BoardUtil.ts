import { BoardElement, Operation } from "../types";
import Board from "../Board";
import BoardOperations from "./BoardOperations";

export class BoardUtil {
  static isBoard(value: unknown): value is Board {
    return Boolean(value && (value as Board).boardFlag === Board.boardFlag);
  }

  static getHitElements(board: Board, x: number, y: number): BoardElement[] {
    const hitElements: BoardElement[] = [];
    this.dfs(board, (node) => {
      if (board.isHit(node, x, y)) {
        hitElements.push(node);
      }
    });
    return hitElements;
  }

  static dfs(
    node: BoardElement | Board,
    visit: (node: BoardElement) => void | boolean,
    quickQuit = false,
  ): boolean | void {
    if (!this.isBoard(node)) {
      visit(node);
    }
    const children = node.children;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const result = this.dfs(child, visit, quickQuit);
        if (quickQuit && result) {
          return result;
        }
      }
    }
  }

  static bfs(
    node: BoardElement | Board,
    visit: (node: BoardElement) => boolean | void,
    quickQuit = false,
  ): boolean | void {
    const queue: (BoardElement | Board)[] = [];
    queue.push(node);
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (!this.isBoard(node)) {
        const result = visit(node);
        if (quickQuit && result) {
          return result;
        }
      }
      const children = node.children;
      if (children) {
        children.forEach((child) => {
          queue.push(child);
        });
      }
    }
  }

  // 缓存机制：存储重复比较的结果
  private static _diffCache = new Map<string, Operation[]>();
  private static _maxCacheSize = 1000;

  /**
   * diff 算法 - 生成基于目标状态的操作序列
   * @param oldChildren 旧的子节点数组
   * @param newChildren 新的子节点数组
   * @param basePath 基础路径，默认为空数组
   * @returns 操作列表（基于目标状态的路径，需要跳过路径转换）
   */
  static diff(
    oldChildren: BoardElement[],
    newChildren: BoardElement[],
    basePath: number[] = [],
  ): Operation[] {
    // 缓存检查
    const cacheKey = this.generateCacheKey(oldChildren, newChildren, basePath);
    if (this._diffCache.has(cacheKey)) {
      return this._diffCache.get(cacheKey) || [];
    }
    const ops: Operation[] = [];

    // 快速路径：相同引用直接返回空数组
    if (oldChildren === newChildren) {
      this.setCacheValue(cacheKey, ops);
      return ops;
    }

    // 快速路径：都为空数组
    if (oldChildren.length === 0 && newChildren.length === 0) {
      this.setCacheValue(cacheKey, ops);
      return ops;
    }

    // 内存优化：重用映射对象
    const oldMap = this.createElementMap(oldChildren);
    const newMap = this.createElementMap(newChildren);

    // 简化的diff算法：生成基于目标状态的操作序列
    // 这些操作需要跳过路径转换，直接执行
    // 核心思路：按正确的执行顺序生成操作

    // 第一步：处理属性修改操作 (set_node)
    // 使用目标状态的索引，因为元素位置可能发生变化
    for (const [id, { element: newElement, index: newIndex }] of Array.from(
      newMap,
    )) {
      if (oldMap.has(id)) {
        const { element: oldElement } = oldMap.get(id)!;
        const path = [...basePath, newIndex]; // 使用目标状态索引

        // 比较元素属性，生成修改操作
        const changes = this.getElementChanges(oldElement, newElement);
        if (Object.keys(changes).length > 0) {
          ops.push({
            type: "set_node",
            path,
            properties: this.getElementProperties(oldElement),
            newProperties: changes,
          });
        }

        // 递归处理子节点
        if (oldElement.children || newElement.children) {
          const oldChildrenArray = oldElement.children || [];
          const newChildrenArray = newElement.children || [];
          const childOps = this.diff(oldChildrenArray, newChildrenArray, path);
          ops.push(...childOps);
        }
      }
    }

    // 第二步：删除操作 - 使用原始索引，按降序删除
    const toDelete = [];
    for (const [id, { element, index }] of Array.from(oldMap)) {
      if (!newMap.has(id)) {
        toDelete.push({ element, index });
      }
    }
    toDelete.sort((a, b) => b.index - a.index); // 降序，从后往前删除
    for (const { element, index } of toDelete) {
      ops.push({
        type: "remove_node",
        path: [...basePath, index], // 使用原始索引
        node: element,
      });
    }

    // 第三步：移动操作 - 先删除需要移动的元素
    const moveElements = [];
    for (const [id, { element: newElement, index: targetIndex }] of Array.from(
      newMap,
    )) {
      if (oldMap.has(id)) {
        const { index: oldIndex } = oldMap.get(id)!;
        if (oldIndex !== targetIndex) {
          moveElements.push({
            id,
            element: newElement,
            oldIndex,
            targetIndex,
          });
        }
      }
    }

    // 删除需要移动的元素（按原始索引降序）
    moveElements.sort((a, b) => b.oldIndex - a.oldIndex);
    for (const { element, oldIndex } of moveElements) {
      ops.push({
        type: "remove_node",
        path: [...basePath, oldIndex],
        node: element,
      });
    }

    // 第四步：插入操作 - 使用目标状态索引，按正确顺序插入
    const allInsertions = [];

    // 新增元素
    for (const [id, { element: newElement, index: targetIndex }] of Array.from(
      newMap,
    )) {
      if (!oldMap.has(id)) {
        allInsertions.push({
          element: newElement,
          targetIndex,
          isNew: true,
        });
      }
    }

    // 移动的元素
    for (const { element, targetIndex } of moveElements) {
      allInsertions.push({
        element,
        targetIndex,
        isNew: false,
      });
    }

    // 按目标位置排序，确保插入顺序正确
    allInsertions.sort((a, b) => a.targetIndex - b.targetIndex);

    // 生成插入操作 - 直接使用目标状态索引
    for (const { element, targetIndex } of allInsertions) {
      ops.push({
        type: "insert_node",
        path: [...basePath, targetIndex],
        node: element,
      });
    }

    // 批量优化：合并连续的同类操作
    const optimizedOps = this.optimizeOperations(ops);

    // 缓存结果
    this.setCacheValue(cacheKey, optimizedOps);

    return optimizedOps;
  }

  /**
   * 获取元素属性变化
   * @param oldElement 旧元素
   * @param newElement 新元素
   * @returns 变化的属性
   */
  private static getElementChanges(
    oldElement: BoardElement,
    newElement: BoardElement,
  ): Partial<BoardElement> {
    const changes: Partial<BoardElement> = {};

    // 比较所有属性，但跳过 children（子节点单独处理）
    for (const key in newElement) {
      if (key === "children") continue;
      if (this.isValueChanged(oldElement[key], newElement[key])) {
        changes[key] = newElement[key];
      }
    }

    // 检查旧元素中是否有新元素中不存在的属性（需要删除）
    for (const key in oldElement) {
      if (key === "children") continue;
      if (!(key in newElement)) {
        changes[key] = null as unknown as undefined; // 设置为 null 表示删除该属性
      }
    }

    return changes;
  }

  /**
   * 获取元素的所有属性（不包括 children）
   * @param element 元素
   * @returns 元素属性
   */
  private static getElementProperties(
    element: BoardElement,
  ): Partial<BoardElement> {
    const { children, ...properties } = element;
    return properties;
  }

  /**
   * 深度比较两个值是否相等
   * @param oldValue 旧值
   * @param newValue 新值
   * @returns 是否发生变化
   */
  private static isValueChanged(oldValue: unknown, newValue: unknown): boolean {
    // 基础类型比较
    if (oldValue === newValue) return false;
    if (oldValue == null || newValue == null) return oldValue !== newValue;

    // 数组比较
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (oldValue.length !== newValue.length) return true;
      return oldValue.some((item, index) =>
        this.isValueChanged(item, newValue[index]),
      );
    }

    // 对象比较
    if (typeof oldValue === "object" && typeof newValue === "object") {
      const oldKeys = Object.keys(oldValue as Record<string, unknown>);
      const newKeys = Object.keys(newValue as Record<string, unknown>);
      if (oldKeys.length !== newKeys.length) return true;

      return oldKeys.some((key) => {
        if (!newKeys.includes(key)) return true;
        return this.isValueChanged(
          (oldValue as Record<string, unknown>)[key],
          (newValue as Record<string, unknown>)[key],
        );
      });
    }

    return true;
  }

  /**
   * 生成缓存键
   */
  private static generateCacheKey(
    oldChildren: BoardElement[],
    newChildren: BoardElement[],
    basePath: number[],
  ): string {
    const oldHash = this.hashArray(oldChildren);
    const newHash = this.hashArray(newChildren);
    const pathStr = basePath.join(",");
    return `${oldHash}:${newHash}:${pathStr}`;
  }

  /**
   * 计算数组哈希值
   */
  private static hashArray(elements: BoardElement[]): string {
    return elements.map((el) => `${el.id}:${el.type}`).join("|");
  }

  /**
   * 设置缓存值
   */
  private static setCacheValue(key: string, value: Operation[]): void {
    if (this._diffCache.size >= this._maxCacheSize) {
      // 清理一半缓存
      const keys = Array.from(this._diffCache.keys());
      keys.slice(0, Math.floor(keys.length / 2)).forEach((k) => {
        this._diffCache.delete(k);
      });
    }
    this._diffCache.set(key, value);
  }

  /**
   * 创建元素映射（内存优化）
   */
  private static createElementMap(
    elements: BoardElement[],
  ): Map<string, { element: BoardElement; index: number }> {
    const map = new Map();
    for (let i = 0; i < elements.length; i++) {
      map.set(elements[i].id, { element: elements[i], index: i });
    }
    return map;
  }

  /**
   * 优化操作列表（批量优化）
   */
  private static optimizeOperations(ops: Operation[]): Operation[] {
    if (ops.length === 0) return ops;

    const optimized: Operation[] = [];
    let i = 0;

    while (i < ops.length) {
      const current = ops[i];

      // 尝试合并连续的同类操作
      if (current.type === "set_node") {
        const batchOps = this.collectBatchSetOperations(ops, i);
        if (batchOps.length > 1) {
          // 合并多个 set_node 操作
          optimized.push(this.mergeBatchSetOperations(batchOps));
          i += batchOps.length;
          continue;
        }
      }

      // 优化移动操作：检测不必要的移动
      if (current.type === "move_node") {
        const moveOp = current as { path: number[]; newPath: number[] };
        if (this.arraysEqual(moveOp.path, moveOp.newPath)) {
          // 移动到相同位置，跳过该操作
          i++;
          continue;
        }
      }

      optimized.push(current);
      i++;
    }

    return optimized;
  }

  /**
   * 收集批量 set_node 操作
   */
  private static collectBatchSetOperations(
    ops: Operation[],
    startIndex: number,
  ): Operation[] {
    const batch: Operation[] = [];
    const firstOp = ops[startIndex];
    if (firstOp.type !== "set_node") return batch;

    const currentPath = (firstOp as Extract<Operation, { type: "set_node" }>)
      .path;

    for (let i = startIndex; i < ops.length; i++) {
      const op = ops[i];
      if (op.type === "set_node") {
        const setOp = op as Extract<Operation, { type: "set_node" }>;
        if (this.arraysEqual(setOp.path, currentPath)) {
          batch.push(op);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return batch;
  }

  /**
   * 合并批量 set_node 操作
   */
  private static mergeBatchSetOperations(operations: Operation[]): Operation {
    if (operations.length === 1) return operations[0];

    const first = operations[0];
    if (first.type !== "set_node") return first;

    const firstSetOp = first as Extract<Operation, { type: "set_node" }>;
    const mergedProperties = {} as Record<string, unknown>;
    const mergedNewProperties = {} as Record<string, unknown>;

    for (const op of operations) {
      if (op.type === "set_node") {
        const setOp = op as Extract<Operation, { type: "set_node" }>;
        Object.assign(mergedProperties, setOp.properties || {});
        Object.assign(mergedNewProperties, setOp.newProperties || {});
      }
    }

    return {
      type: "set_node",
      path: firstSetOp.path,
      properties: mergedProperties,
      newProperties: mergedNewProperties,
    } as Extract<Operation, { type: "set_node" }>;
  }

  /**
   * 比较两个数组是否相等
   */
  private static arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * 应用操作列表到子节点数组（使用Board.tsx的真实apply逻辑）
   * @param children 原始子节点数组
   * @param operations 操作列表
   * @returns 应用操作后的新数组
   */
  static apply(
    children: BoardElement[],
    operations: Operation[],
  ): BoardElement[] {
    if (!operations || operations.length === 0) {
      return JSON.parse(JSON.stringify(children));
    }

    // 使用抽离出来的Board.tsx真实逻辑
    return BoardOperations.applyToChildren(children, operations);
  }

  static inverseOperation = (op: Operation): Operation => {
    switch (op.type) {
      case "insert_node": {
        return { ...op, type: "remove_node" };
      }

      case "remove_node": {
        return { ...op, type: "insert_node" };
      }

      case "move_node": {
        // Move操作的逆操作是反向移动
        const moveOp = op as Extract<Operation, { type: "move_node" }>;
        return {
          ...moveOp,
          path: moveOp.newPath,
          newPath: moveOp.path,
        };
      }

      case "set_node": {
        const { properties, newProperties } = op;
        return { ...op, properties: newProperties, newProperties: properties };
      }

      case "set_selection": {
        const { properties, newProperties } = op;
        return { ...op, properties: newProperties, newProperties: properties };
      }

      case "set_viewport": {
        const { properties, newProperties } = op;
        if (properties == null) {
          return {
            ...op,
            properties: newProperties,
            newProperties: newProperties,
          };
        } else if (newProperties == null) {
          return {
            ...op,
            properties: properties,
            newProperties: properties,
          };
        } else {
          return {
            ...op,
            properties: newProperties,
            newProperties: properties,
          };
        }
      }

      case "set_theme": {
        const { properties, newProperties } = op;
        return { ...op, properties: newProperties, newProperties: properties };
      }

      case "set_moving": {
        const { properties, newProperties } = op;
        return { ...op, properties: newProperties, newProperties: properties };
      }

      default: {
        throw new Error("unsupport operation");
      }
    }
  };
}

export default BoardUtil;
