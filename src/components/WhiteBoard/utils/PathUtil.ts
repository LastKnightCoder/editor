import { InsertNodeOperation, Path as SlatePath } from "slate";
import { BoardElement, Board, Operation } from "../types";
import BoardUtil from "./BoardUtil.ts";

export type Path = number[];

export class PathUtil {
  static getPathByElement(
    board: Board,
    element: BoardElement & any,
  ): Path | null {
    const path: Path = [];
    const dfs = (node: Board | BoardElement, index?: number) => {
      if (!BoardUtil.isBoard(node)) {
        path.push(index!);
        if (node.id === element.id) {
          return true;
        }
      }
      const children = node.children;
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (dfs(child, i)) {
            return true;
          }
          path.pop();
        }
      }
    };
    return dfs(board) && path.length > 0 ? path : null;
  }

  static getElementByPath(board: Board, path: number[]): BoardElement {
    if (path.length === 0) {
      throw new Error("path is empty");
    }
    const { children } = board;
    // 根据 path 从数组中找到对应的节点，如果不存在抛出异常
    // value 是一个数组
    const node = this.getElement(children, path);
    if (!node) {
      throw new Error(`node not found by path: ${path}`);
    } else {
      return node;
    }
  }

  static getElement(children: BoardElement[], path: Path): BoardElement | null {
    const element = children[path[0]];
    if (path.length === 1) {
      return element;
    }
    if (!element.children) return null;

    return this.getElement(element.children, path.slice(1));
  }

  static getParentByPath(
    board: Board,
    path: Path,
  ): Board | BoardElement | null {
    if (path.length === 0) return null;
    if (path.length === 1) return board;
    const parentPath = path.slice(0, -1);
    return this.getElementByPath(board, parentPath);
  }

  /**
   * 根据已执行的操作转换路径
   * 这是解决批量操作中路径失效问题的核心方法
   * @param path 要转换的路径
   * @param operation 已执行的操作
   * @param targetOpType 目标路径所属的操作类型（可选）
   */
  static transformPath(
    path: Path,
    operation: Operation,
    targetOpType?: string,
  ): Path | null {
    if (!path) {
      return null;
    }

    if (path.length === 0) {
      return [...path];
    }

    if (
      operation.type !== "insert_node" &&
      operation.type !== "remove_node" &&
      operation.type !== "move_node"
    ) {
      return [...path];
    }

    const currentPath = [...path];
    const opPath = operation.path;

    switch (operation.type) {
      case "insert_node": {
        if (
          SlatePath.equals(opPath, currentPath) ||
          SlatePath.endsBefore(opPath, currentPath) ||
          SlatePath.isAncestor(opPath, currentPath)
        ) {
          this.adjustPathIndex(currentPath, opPath.length - 1, 1);
        }
        return currentPath;
      }

      case "remove_node": {
        if (SlatePath.equals(opPath, currentPath)) {
          return targetOpType === "insert_node" ? currentPath : null;
        }

        if (SlatePath.isAncestor(opPath, currentPath)) {
          return null;
        }

        if (SlatePath.endsBefore(opPath, currentPath)) {
          this.adjustPathIndex(currentPath, opPath.length - 1, -1);
          return currentPath;
        }

        return currentPath;
      }

      case "move_node": {
        const moveOp = operation as Extract<Operation, { type: "move_node" }>;
        return (
          this.transformPathByMove(currentPath, moveOp.path, moveOp.newPath) ??
          currentPath
        );
      }

      default:
        return currentPath;
    }
  }

  private static transformPathByMove(
    path: Path,
    from: Path,
    to: Path,
  ): Path | null {
    const current = [...path];

    if (SlatePath.equals(from, to)) {
      return current;
    }

    if (
      SlatePath.equals(from, current) ||
      SlatePath.isAncestor(from, current)
    ) {
      const copy = [...to];

      if (SlatePath.endsBefore(from, to) && from.length < to.length) {
        this.adjustPathIndex(copy, from.length - 1, -1);
      }

      return copy.concat(current.slice(from.length));
    }

    if (
      SlatePath.isSibling(from, to) &&
      (SlatePath.isAncestor(to, current) || SlatePath.equals(to, current))
    ) {
      if (SlatePath.endsBefore(from, current)) {
        this.adjustPathIndex(current, from.length - 1, -1);
      } else {
        this.adjustPathIndex(current, from.length - 1, 1);
      }
      return current;
    }

    if (
      SlatePath.endsBefore(to, current) ||
      SlatePath.equals(to, current) ||
      SlatePath.isAncestor(to, current)
    ) {
      if (SlatePath.endsBefore(from, current)) {
        this.adjustPathIndex(current, from.length - 1, -1);
      }
      this.adjustPathIndex(current, to.length - 1, 1);
      return current;
    }

    if (SlatePath.endsBefore(from, current)) {
      if (SlatePath.equals(to, current)) {
        this.adjustPathIndex(current, to.length - 1, 1);
      }
      this.adjustPathIndex(current, from.length - 1, -1);
      return current;
    }

    return current;
  }

  private static adjustPathIndex(
    path: Path,
    depth: number,
    delta: number,
  ): void {
    if (depth >= 0 && depth < path.length) {
      path[depth] += delta;
    }
  }

  /**
   * 判断 ancestorPath 是否是 descendantPath 的祖先路径
   */
  private static isAncestorPath(
    ancestorPath: Path,
    descendantPath: Path,
  ): boolean {
    // 祖先路径必须更短
    if (ancestorPath.length >= descendantPath.length) {
      return false;
    }

    // 检查前缀是否匹配
    for (let i = 0; i < ancestorPath.length; i++) {
      if (ancestorPath[i] !== descendantPath[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * 判断两个路径是否相等
   */
  private static pathsEqual(path1: Path, path2: Path): boolean {
    if (path1.length !== path2.length) {
      return false;
    }

    for (let i = 0; i < path1.length; i++) {
      if (path1[i] !== path2[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查路径是否在指定操作索引之后被删除（或其祖先路径被删除）
   * 这个方法考虑操作的执行顺序
   */
  private static isPathDeletedBeforeIndex(
    path: Path,
    operations: Operation[],
    currentIndex: number,
  ): boolean {
    if (path.length === 0) return false; // 根路径不会被删除

    // 只检查当前操作之后的删除操作
    for (let i = 0; i < currentIndex; i++) {
      const op = operations[i];
      if (op.type === "remove_node") {
        if (
          this.isAncestorPath(op.path, path) ||
          this.pathsEqual(op.path, path)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 过滤掉无效的操作（父元素被删除等）
   * 包括祖先-子孙关系过滤：删除祖先时自动过滤子孙删除操作
   * 考虑操作顺序：对于move_node，如果先move再删除，则move操作有效
   * 返回过滤后的原始操作，用于保存到历史记录
   *
   * 性能优化：使用Set和Map加速路径查找和比较
   */
  static filterValidOperations(
    operations: Operation[],
    skipValidation?: (operation: Operation) => boolean,
  ): Operation[] {
    // 第一步：预先收集所有删除和插入操作的路径
    const allDeletedPaths: Path[] = [];
    const allInsertedPaths: Path[] = [];

    for (const op of operations) {
      if (op.type === "remove_node") {
        allDeletedPaths.push(op.path);
      } else if (op.type === "insert_node") {
        allInsertedPaths.push(op.path);
      }
    }

    // 第二步：过滤祖先-子孙关系的删除路径
    const filteredDeletePaths =
      this.filterAncestorDescendantPaths(allDeletedPaths);

    // 第三步：检查是否存在"删除后又插入"的路径（使用Set优化性能）
    const insertedPathSet = new Set(
      allInsertedPaths.map((path) => JSON.stringify(path)),
    );
    const reinsertedPaths = filteredDeletePaths.filter((deletedPath) =>
      insertedPathSet.has(JSON.stringify(deletedPath)),
    );

    // 创建快速查找集合，避免重复的路径比较
    const reinsertedPathSet = new Set(
      reinsertedPaths.map((path) => JSON.stringify(path)),
    );
    const filteredDeletePathSet = new Set(
      filteredDeletePaths.map((path) => JSON.stringify(path)),
    );

    const validOps: Operation[] = [];

    // 第四步：根据过滤后的删除路径过滤其他操作，考虑操作顺序
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (skipValidation?.(op)) {
        validOps.push(op);
        continue;
      }
      let isValid = true;

      if (op.type === "remove_node") {
        if (!filteredDeletePathSet.has(JSON.stringify(op.path))) {
          isValid = false;
        }
      } else if (op.type === "insert_node") {
        const parentPath = op.path.slice(0, -1);
        if (this.isPathDeletedBeforeIndex(parentPath, operations, i)) {
          isValid = false;
        }
      } else if (op.type === "move_node" && op.newPath) {
        if (this.isPathDeletedBeforeIndex(op.path, operations, i)) {
          isValid = false;
        }
        const targetParentPath = op.newPath.slice(0, -1);
        if (this.isPathDeletedBeforeIndex(targetParentPath, operations, i)) {
          isValid = false;
        }
      } else if (op.type === "set_node") {
        // 特殊处理：如果路径被删除后又被重新插入，则set_node操作仍然有效（使用Set快速查找）
        const pathStr = JSON.stringify(op.path);
        const isReinserted = reinsertedPathSet.has(pathStr);
        if (
          !isReinserted &&
          this.isPathDeletedBeforeIndex(op.path, operations, i)
        ) {
          isValid = false;
        }
      }

      if (isValid) {
        validOps.push(op);
      }
    }

    return validOps;
  }

  /**
   * 过滤祖先-子孙关系的路径
   * 如果删除了祖先路径，其子孙路径的删除就是冗余的
   */
  private static filterAncestorDescendantPaths(paths: Path[]): Path[] {
    const result: Path[] = [];

    for (let i = 0; i < paths.length; i++) {
      const currentPath = paths[i];
      let isRedundant = false;

      // 检查是否存在祖先路径也被删除
      for (let j = 0; j < paths.length; j++) {
        if (i === j) continue;

        const otherPath = paths[j];

        // 如果 otherPath 是 currentPath 的祖先路径
        if (this.isAncestorPath(otherPath, currentPath)) {
          isRedundant = true;
          break;
        }
      }

      if (!isRedundant) {
        result.push(currentPath);
      }
    }

    return result;
  }

  /**
   * 简化的操作排序：只保证基本的执行顺序
   * 插入操作需要按深度排序，确保父元素先于子元素创建
   */
  static sortOperationsForExecution(operations: Operation[]): Operation[] {
    // 分离插入操作和其他操作，保持相对位置信息
    const operationsWithIndex = operations.map((op, index) => ({
      op,
      originalIndex: index,
    }));
    const insertOps = operationsWithIndex.filter(
      (item) => item.op.type === "insert_node",
    );
    const removeOps = operationsWithIndex.filter(
      (item) => item.op.type === "remove_node",
    );
    const otherOps = operationsWithIndex.filter(
      (item) =>
        item.op.type !== "insert_node" && item.op.type !== "remove_node",
    );

    // 对插入操作按深度排序（浅→深）
    insertOps.sort((a, b) => {
      const pathA = (a.op as InsertNodeOperation).path;
      const pathB = (b.op as InsertNodeOperation).path;
      if (pathA.length !== pathB.length) {
        return pathA.length - pathB.length;
      }
      // 如果长度相同，那么小的在前面
      return a.originalIndex - b.originalIndex;
    });

    // 删除操作保持原始顺序，让 PathRef 自动调整

    // 重新合并操作，插入和删除操作按新顺序，其他操作保持原位置
    const result: Operation[] = [];
    let insertIndex = 0;
    let removeIndex = 0;
    let otherIndex = 0;

    for (let i = 0; i < operations.length; i++) {
      if (operations[i].type === "insert_node") {
        // 插入位置应该放入排序后的插入操作
        if (insertIndex < insertOps.length) {
          result.push(insertOps[insertIndex].op);
          insertIndex++;
        }
      } else if (operations[i].type === "remove_node") {
        // 删除位置应该放入排序后的删除操作
        if (removeIndex < removeOps.length) {
          result.push(removeOps[removeIndex].op);
          removeIndex++;
        }
      } else {
        // 非插入和删除操作保持原始顺序
        if (otherIndex < otherOps.length) {
          result.push(otherOps[otherIndex].op);
          otherIndex++;
        }
      }
    }

    return result;
  }

  /**
   * 转换有效操作：基于原始操作路径计算累积影响，避免转换链式误差
   * 性能优化：缓存路径变换结果，避免重复计算
   */
  static transformValidOperations(operations: Operation[]): Operation[] {
    if (operations.length === 0) {
      return operations;
    }

    // 为每个操作计算基于原始状态的路径转换
    const result: Operation[] = [];

    // 性能优化：缓存相同前序操作集合的路径变换结果
    const transformCache = new Map<string, Path | null>();

    for (let i = 0; i < operations.length; i++) {
      const currentOp = { ...operations[i] };

      if (this.operationHasPath(currentOp)) {
        // 计算前序操作（使用原始路径）对当前操作的累积影响
        const originalPath = (currentOp as any).path;

        // 使用缓存键避免重复计算
        const cacheKey = `${JSON.stringify(originalPath)}-${currentOp.type}-${i}`;
        let transformedPath: Path | null;

        if (transformCache.has(cacheKey)) {
          transformedPath = transformCache.get(cacheKey)!;
        } else {
          transformedPath = this.calculateCumulativePathTransform(
            originalPath,
            operations.slice(0, i), // 使用原始操作，不是已转换的操作
            currentOp.type, // 传递当前操作类型
          );
          transformCache.set(cacheKey, transformedPath);
        }

        if (transformedPath === null) {
          // 路径无效，跳过这个操作
          continue;
        }

        (currentOp as any).path = transformedPath;
      }

      // 处理move操作的目标路径
      if (currentOp.type === "move_node" && (currentOp as any).newPath) {
        const originalNewPath = (currentOp as any).newPath;

        // 使用缓存键避免重复计算
        const newPathCacheKey = `${JSON.stringify(originalNewPath)}-move_target-${i}`;
        let transformedNewPath: Path | null;

        if (transformCache.has(newPathCacheKey)) {
          transformedNewPath = transformCache.get(newPathCacheKey)!;
        } else {
          transformedNewPath = this.calculateCumulativePathTransform(
            originalNewPath,
            operations.slice(0, i),
            currentOp.type,
          );
          transformCache.set(newPathCacheKey, transformedNewPath);
        }

        if (transformedNewPath === null) {
          continue;
        }

        (currentOp as any).newPath = transformedNewPath;
      }

      result.push(currentOp);
    }

    return result;
  }

  /**
   * 计算一系列操作对目标路径的累积影响
   * 基于原始操作路径，按执行顺序计算影响
   * @param targetPath 目标路径
   * @param precedingOps 前序操作列表
   * @param targetOpType 目标路径所属的操作类型（可选）
   */
  private static calculateCumulativePathTransform(
    targetPath: Path,
    precedingOps: Operation[],
    targetOpType?: string,
  ): Path | null {
    let currentPath = [...targetPath];

    // 按执行顺序处理每个前序操作
    for (const op of precedingOps) {
      if (!this.operationHasPath(op)) {
        continue;
      }

      const opPath = (op as any).path;

      // 检查这个操作是否会影响当前路径
      if (this.pathWouldBeAffected(currentPath, op.type, opPath)) {
        const newPath = this.applyDirectTransform(
          currentPath,
          op.type,
          opPath,
          targetOpType,
        );
        if (newPath === null) {
          return null; // 路径被删除
        }
        currentPath = newPath;
      }
    }

    return currentPath;
  }

  /**
   * 检查路径是否会被特定操作影响
   */
  private static pathWouldBeAffected(
    targetPath: Path,
    opType: string,
    opPath: Path,
  ): boolean {
    // 检查顶层路径（白板的直接子元素）
    if (targetPath.length === 1 && opPath.length === 1) {
      const targetIndex = targetPath[0];
      const opIndex = opPath[0];

      switch (opType) {
        case "insert_node":
          return targetIndex > opIndex;
        case "remove_node":
          return targetIndex > opIndex;
        case "set_node":
          return false;
        case "move_node":
          return targetIndex === opIndex || targetIndex > opIndex;
        default:
          return false;
      }
    }

    // 检查同层级同深度的影响：例如 [0, 0] 和 [0, 1]
    if (targetPath.length === opPath.length && targetPath.length > 1) {
      // 检查除了最后一个索引外，其他部分是否相同
      let sameParent = true;
      for (let i = 0; i < targetPath.length - 1; i++) {
        if (targetPath[i] !== opPath[i]) {
          sameParent = false;
          break;
        }
      }

      if (sameParent) {
        // 同父级的兄弟节点，检查最后一层的影响
        const lastIndex = targetPath.length - 1;
        const targetIndex = targetPath[lastIndex];
        const opIndex = opPath[lastIndex];

        switch (opType) {
          case "insert_node":
            return targetIndex > opIndex;
          case "remove_node":
            return targetIndex > opIndex;
          case "set_node":
            return false;
          case "move_node":
            return targetIndex === opIndex || targetIndex > opIndex;
          default:
            return false;
        }
      }
    }

    // 检查跨层级影响：上层操作对下层路径的影响
    if (targetPath.length > 1 && opPath.length < targetPath.length) {
      // 检查操作路径是否是目标路径的前缀
      for (let i = 0; i < opPath.length; i++) {
        if (targetPath[i] !== opPath[i]) {
          // 如果在某个层级不匹配，检查是否是同级影响
          if (i === opPath.length - 1) {
            // 最后一层，检查同级影响
            switch (opType) {
              case "remove_node":
                return targetPath[i] > opPath[i];
              case "insert_node":
                return targetPath[i] >= opPath[i];
              case "move_node":
                return targetPath[i] === opPath[i] || targetPath[i] > opPath[i];
              default:
                return false;
            }
          }
          return false;
        }
      }
      // 如果操作路径是目标路径的完整前缀，则不影响（除非是删除操作）
      return opType === "remove_node";
    }

    return false;
  }

  /**
   * 直接应用单个操作对路径的影响
   * @param targetPath 目标路径
   * @param opType 操作类型
   * @param opPath 操作路径
   * @param targetOpType 目标路径所属的操作类型（可选）
   */
  private static applyDirectTransform(
    targetPath: Path,
    opType: string,
    opPath: Path,
    targetOpType?: string,
  ): Path | null {
    // 处理顶层路径
    if (targetPath.length === 1 && opPath.length === 1) {
      const targetIndex = targetPath[0];
      const opIndex = opPath[0];

      switch (opType) {
        case "insert_node":
          if (targetIndex >= opIndex) {
            return [targetIndex + 1];
          }
          return targetPath;
        case "remove_node":
          if (targetIndex === opIndex) {
            if (targetOpType === "insert_node") {
              return targetPath;
            }
            return null;
          } else if (targetIndex > opIndex) {
            return [targetIndex - 1];
          }
          return targetPath;
        case "set_node":
          return targetPath;
        case "move_node":
          if (targetIndex === opIndex) {
            // 对于 move 操作，如果两个操作都尝试移动同一位置的元素，
            // 第二个操作应该被视为无效，但我们不应该完全删除它，
            // 而是让它尝试移动一个不存在的元素（这会在执行时被忽略）
            // 为了保持操作的完整性，我们标记这种情况
            return null;
          }
          if (targetIndex > opIndex) {
            return [targetIndex - 1];
          }
          return targetPath;
        default:
          return targetPath;
      }
    }

    // 处理同层级同深度的影响：例如 [0, 0] 和 [0, 1]
    if (targetPath.length === opPath.length && targetPath.length > 1) {
      // 检查除了最后一个索引外，其他部分是否相同
      let sameParent = true;
      for (let i = 0; i < targetPath.length - 1; i++) {
        if (targetPath[i] !== opPath[i]) {
          sameParent = false;
          break;
        }
      }

      if (sameParent) {
        const newPath = [...targetPath];
        const lastIndex = targetPath.length - 1;
        const targetIndex = targetPath[lastIndex];
        const opIndex = opPath[lastIndex];

        switch (opType) {
          case "insert_node":
            if (targetIndex >= opIndex) {
              newPath[lastIndex] = targetIndex + 1;
            }
            return newPath;
          case "remove_node":
            if (targetIndex === opIndex) {
              if (targetOpType === "insert_node") {
                return targetPath;
              }
              return null;
            } else if (targetIndex > opIndex) {
              newPath[lastIndex] = targetIndex - 1;
            }
            return newPath;
          case "set_node":
            return targetPath;
          case "move_node":
            if (targetIndex === opIndex) {
              return null;
            }
            if (targetIndex > opIndex) {
              newPath[lastIndex] = targetIndex - 1;
            }
            return newPath;
          default:
            return targetPath;
        }
      }
    }

    // 处理跨层级影响
    if (targetPath.length > 1 && opPath.length < targetPath.length) {
      const newPath = [...targetPath];
      const affectedDepth = opPath.length - 1;

      // 检查是否是前缀匹配的跨层级影响
      let isPrefix = true;
      for (let i = 0; i < opPath.length - 1; i++) {
        if (targetPath[i] !== opPath[i]) {
          isPrefix = false;
          break;
        }
      }

      if (isPrefix) {
        const targetIndex = targetPath[affectedDepth];
        const opIndex = opPath[affectedDepth];

        switch (opType) {
          case "insert_node":
            if (targetIndex >= opIndex) {
              newPath[affectedDepth] = targetIndex + 1;
            }
            return newPath;
          case "remove_node":
            if (targetIndex === opIndex) {
              return null; // 祖先被删除
            } else if (targetIndex > opIndex) {
              newPath[affectedDepth] = targetIndex - 1;
            }
            return newPath;
          case "move_node":
            if (targetIndex === opIndex) {
              return null; // 祖先被移动，当前路径失效
            } else if (targetIndex > opIndex) {
              newPath[affectedDepth] = targetIndex - 1;
            }
            return newPath;
          default:
            return targetPath;
        }
      }
    }

    return targetPath;
  }

  /**
   * 检查操作是否有路径需要转换
   */
  private static operationHasPath(operation: Operation): boolean {
    return (
      operation &&
      (operation.type === "insert_node" ||
        operation.type === "remove_node" ||
        operation.type === "move_node" ||
        operation.type === "set_node")
    );
  }
}

export default PathUtil;
