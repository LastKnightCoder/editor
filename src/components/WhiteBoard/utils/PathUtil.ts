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
   */
  static transformPath(path: Path, operation: Operation): Path | null {
    // 只有特定类型的操作才有 path 属性
    if (
      operation.type !== "insert_node" &&
      operation.type !== "remove_node" &&
      operation.type !== "move_node" &&
      operation.type !== "set_node"
    ) {
      return path;
    }

    const opPath = operation.path;

    // 如果目标路径为空，不受任何操作影响
    if (path.length === 0) {
      return path;
    }

    // 如果操作路径为空，也不应该影响任何路径
    if (opPath.length === 0) {
      return path;
    }

    // 设置操作不影响路径结构
    if (operation.type === "set_node") {
      return path;
    }

    // Move操作的特殊处理
    if (operation.type === "move_node" && operation.newPath) {
      // 检查源路径和目标路径是否都与当前路径同级
      if (
        this.areSiblingPaths(path, opPath) &&
        this.areSiblingPaths(path, operation.newPath)
      ) {
        // 同级原子性Move操作
        console.log(
          `Move操作调试（同级）: path=${JSON.stringify(path)}, opPath=${JSON.stringify(opPath)}, newPath=${JSON.stringify(operation.newPath)}`,
        );

        const newPath = [...path];
        const lastIndex = path.length - 1;
        const sourceIndex = opPath[lastIndex];
        const targetIndex = operation.newPath[lastIndex];
        const currentIndex = path[lastIndex];

        // 被移动的元素本身：应该返回目标位置
        if (currentIndex === sourceIndex) {
          console.log(`被移动的元素本身，返回目标位置`);
          return operation.newPath.slice(); // 返回目标位置
        }

        // 同位置移动，无影响
        if (sourceIndex === targetIndex) {
          return newPath;
        }

        if (sourceIndex < targetIndex) {
          // 向后移动：(source, target] 区间的元素向前移动一位
          if (currentIndex > sourceIndex && currentIndex <= targetIndex) {
            newPath[lastIndex] = currentIndex - 1;
            console.log(
              `向后移动影响：${JSON.stringify(path)} -> ${JSON.stringify(newPath)}`,
            );
          }
        } else if (sourceIndex > targetIndex) {
          // 向前移动：两个影响区间
          if (currentIndex >= targetIndex && currentIndex < sourceIndex) {
            newPath[lastIndex] = currentIndex + 1;
            console.log(
              `向前移动-插入影响：${JSON.stringify(path)} -> ${JSON.stringify(newPath)}`,
            );
          } else if (currentIndex > sourceIndex) {
            newPath[lastIndex] = currentIndex - 1;
            console.log(
              `向前移动-删除影响：${JSON.stringify(path)} -> ${JSON.stringify(newPath)}`,
            );
          }
        }

        console.log(
          `Move操作最终结果: ${JSON.stringify(path)} -> ${JSON.stringify(newPath)}`,
        );
        return newPath;
      }
      // 如果不是同级的Move操作，继续到下面的跨级处理逻辑
    }

    // 检查是否为同级操作（非Move）
    if (this.areSiblingPaths(path, opPath)) {
      // 同级操作：直接影响索引
      const newPath = [...path];
      const lastIndex = path.length - 1;

      if (operation.type === "insert_node") {
        // 插入操作：如果目标路径索引 >= 插入位置，索引+1
        if (path[lastIndex] >= opPath[lastIndex]) {
          newPath[lastIndex] = path[lastIndex] + 1;
        }
        return newPath;
      } else if (operation.type === "remove_node") {
        // 删除操作
        if (path[lastIndex] === opPath[lastIndex]) {
          // 被删除的元素本身
          return null;
        } else if (path[lastIndex] > opPath[lastIndex]) {
          // 位置在删除元素之后，索引-1
          newPath[lastIndex] = path[lastIndex] - 1;
        }
        return newPath;
      }
    }

    // 检查是否有公共父路径的影响（不同层级的影响）
    const commonPrefixLength = this.getCommonPrefixLength(path, opPath);

    if (commonPrefixLength >= 0) {
      const newPath = [...path];

      // 影响规则：
      // 1. 如果路径完全一致到某个深度，那么在分歧的深度检查影响
      // 2. 如果操作路径较短（上层操作），影响目标路径在对应层级的索引

      let affectedDepth = commonPrefixLength;

      // 处理上层操作影响下层的情况
      if (commonPrefixLength === opPath.length && path.length > opPath.length) {
        // 操作路径是目标路径的前缀，上层操作影响下层
        affectedDepth = opPath.length;
      }

      if (operation.type === "insert_node") {
        // 插入操作：检查影响
        if (
          path.length > affectedDepth &&
          path[affectedDepth] >= opPath[affectedDepth]
        ) {
          newPath[affectedDepth] = path[affectedDepth] + 1;
          return newPath;
        }
      } else if (operation.type === "remove_node") {
        // 删除操作：检查影响
        if (
          path.length > affectedDepth &&
          path[affectedDepth] > opPath[affectedDepth]
        ) {
          newPath[affectedDepth] = path[affectedDepth] - 1;
          return newPath;
        }
      } else if (operation.type === "move_node" && operation.newPath) {
        // Move操作的跨级影响：分别处理删除和插入影响
        // 首先检查是否是被移动的元素本身
        if (this.pathsEqual(path, opPath)) {
          return operation.newPath.slice(); // 返回目标位置
        }

        // 关键修复：检查是否是被移动元素的子路径（祖先路径重构）
        if (this.isAncestorPath(opPath, path)) {
          // 路径是被移动元素的子路径，需要重构祖先部分
          const relativePath = path.slice(opPath.length); // 提取相对路径
          const newPath = [...operation.newPath, ...relativePath]; // 重构：新祖先 + 相对路径
          return newPath;
        }

        // 检查是否受源路径删除影响（仅同级）
        if (this.areSiblingPaths(path, opPath)) {
          const lastIndex = path.length - 1;
          if (path[lastIndex] > opPath[lastIndex]) {
            newPath[lastIndex] = path[lastIndex] - 1;
            return newPath;
          }
        }

        // 检查是否受目标路径插入影响（仅同级）
        if (this.areSiblingPaths(path, operation.newPath)) {
          const lastIndex = path.length - 1;
          if (path[lastIndex] >= operation.newPath[lastIndex]) {
            newPath[lastIndex] = path[lastIndex] + 1;
            return newPath;
          }
        }
      }
    }

    // 其他情况下，路径不受影响
    return path;
  }

  /**
   * 获取两个路径的公共前缀长度
   */
  private static getCommonPrefixLength(path1: Path, path2: Path): number {
    const minLength = Math.min(path1.length, path2.length);
    let commonLength = 0;

    for (let i = 0; i < minLength; i++) {
      if (path1[i] === path2[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    return commonLength;
  }

  /**
   * 判断两个路径是否为兄弟节点（在同一父级下）
   */
  private static areSiblingPaths(path1: Path, path2: Path): boolean {
    // 空路径不能是兄弟节点
    if (path1.length === 0 || path2.length === 0) {
      return false;
    }

    // 如果路径长度不同，不可能是兄弟节点
    if (path1.length !== path2.length) {
      return false;
    }

    // 根级路径（长度为1）都是兄弟节点，因为它们的父节点都是根节点
    if (path1.length === 1) {
      return true;
    }

    // 除了最后一个索引外，其他部分必须完全相同
    for (let i = 0; i < path1.length - 1; i++) {
      if (path1[i] !== path2[i]) {
        return false;
      }
    }

    return true;
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
   * 检查路径是否被删除（或其祖先路径被删除）
   */
  private static isPathDeleted(path: Path, deletedPaths: Path[]): boolean {
    if (path.length === 0) return false; // 根路径不会被删除

    for (const deletedPath of deletedPaths) {
      if (
        this.isAncestorPath(deletedPath, path) ||
        this.pathsEqual(deletedPath, path)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 过滤掉无效的操作（父元素被删除等）
   * 包括祖先-子孙关系过滤：删除祖先时自动过滤子孙删除操作
   * 返回过滤后的原始操作，用于保存到历史记录
   */
  static filterValidOperations(operations: Operation[]): Operation[] {
    // 第一步：预先收集所有删除操作的路径
    const allDeletedPaths: Path[] = [];
    for (const op of operations) {
      if (op.type === "remove_node") {
        allDeletedPaths.push(op.path);
      }
    }

    // 第二步：过滤祖先-子孙关系的删除路径
    const filteredDeletePaths =
      this.filterAncestorDescendantPaths(allDeletedPaths);

    const validOps: Operation[] = [];

    // 第三步：根据过滤后的删除路径过滤其他操作
    for (const op of operations) {
      let isValid = true;

      if (op.type === "remove_node") {
        // 只保留过滤后的删除操作
        if (
          !filteredDeletePaths.some((path) => this.pathsEqual(path, op.path))
        ) {
          isValid = false;
        }
      } else if (op.type === "insert_node") {
        // 检查插入位置的父路径是否将要被删除
        const parentPath = op.path.slice(0, -1);
        if (this.isPathDeleted(parentPath, filteredDeletePaths)) {
          isValid = false;
        }
      } else if (op.type === "move_node" && op.newPath) {
        // 检查源路径是否将要被删除
        if (this.isPathDeleted(op.path, filteredDeletePaths)) {
          isValid = false;
        }
        // 检查目标父路径是否将要被删除
        const targetParentPath = op.newPath.slice(0, -1);
        if (this.isPathDeleted(targetParentPath, filteredDeletePaths)) {
          isValid = false;
        }
      } else if (op.type === "set_node") {
        // 检查设置操作的目标路径是否将要被删除
        if (this.isPathDeleted(op.path, filteredDeletePaths)) {
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
   * 对过滤后的操作进行排序，确保正确的执行顺序
   * - 插入操作：按深度从浅到深，确保父节点先于子节点插入
   * - 删除操作：按深度从深到浅，同层按索引从大到小，为撤销时的正确顺序做准备
   */
  static sortOperationsForExecution(operations: Operation[]): Operation[] {
    const insertOps: Operation[] = [];
    const removeOps: Operation[] = [];
    const setOps: Operation[] = [];
    const otherOps: Operation[] = [];

    // 操作分类
    for (const op of operations) {
      if (op.type === "insert_node") {
        insertOps.push(op);
      } else if (op.type === "remove_node") {
        removeOps.push(op);
      } else if (op.type === "set_node") {
        setOps.push(op);
      } else {
        otherOps.push(op);
      }
    }

    // 对插入操作排序：父节点先于子节点插入（深度从浅到深）
    insertOps.sort((a, b) => {
      const pathA = (a as any).path;
      const pathB = (b as any).path;

      if (pathA.length !== pathB.length) {
        return pathA.length - pathB.length; // 浅层优先
      }

      for (let i = 0; i < pathA.length; i++) {
        if (pathA[i] !== pathB[i]) {
          return pathA[i] - pathB[i];
        }
      }

      return 0;
    });

    // 对删除操作排序：为撤销时的正确顺序做准备（深层优先，同层大索引优先）
    removeOps.sort((a, b) => {
      const pathA = (a as any).path;
      const pathB = (b as any).path;

      // 深度优先（深层先删除）
      if (pathA.length !== pathB.length) {
        return pathB.length - pathA.length;
      }

      // 同层内按索引倒序（大索引先删除）
      for (let i = 0; i < pathA.length; i++) {
        if (pathA[i] !== pathB[i]) {
          return pathB[i] - pathA[i];
        }
      }

      return 0;
    });

    // 对设置操作排序：父节点先于子节点设置（深度从浅到深）
    setOps.sort((a, b) => {
      const pathA = (a as any).path;
      const pathB = (b as any).path;

      if (pathA.length !== pathB.length) {
        return pathA.length - pathB.length;
      }

      for (let i = 0; i < pathA.length; i++) {
        if (pathA[i] !== pathB[i]) {
          return pathA[i] - pathB[i];
        }
      }

      return 0;
    });

    // 返回排序后的操作：其他操作 -> 插入操作 -> 设置操作 -> 删除操作
    return [...otherOps, ...insertOps, ...setOps, ...removeOps];
  }

  /**
   * 转换有效操作的路径
   * 用于执行时的路径调整
   */
  static transformValidOperations(operations: Operation[]): Operation[] {
    const result: Operation[] = [];

    for (let i = 0; i < operations.length; i++) {
      const currentOp = operations[i];
      let transformedOp = { ...currentOp };

      // 根据之前的操作转换当前操作的路径
      for (let j = 0; j < result.length; j++) {
        const previousOp = result[j];

        // 转换主要路径
        if (
          transformedOp &&
          (transformedOp.type === "insert_node" ||
            transformedOp.type === "remove_node" ||
            transformedOp.type === "move_node" ||
            transformedOp.type === "set_node")
        ) {
          const newPath = this.transformPath(transformedOp.path, previousOp);
          if (newPath === null) {
            // 如果路径无效（比如父元素被删除），跳过此操作
            transformedOp = null as any;
            break;
          }
          transformedOp.path = newPath;
        }

        // 对于move操作，还需要转换目标路径
        if (
          transformedOp &&
          transformedOp.type === "move_node" &&
          transformedOp.newPath
        ) {
          const newTargetPath = this.transformPath(
            transformedOp.newPath,
            previousOp,
          );
          if (newTargetPath === null) {
            // 如果目标路径无效，跳过此操作
            transformedOp = null as any;
            break;
          }
          transformedOp.newPath = newTargetPath;
        }
      }

      // 只有有效的操作才添加到结果中
      if (transformedOp) {
        result.push(transformedOp);
      }
    }

    return result;
  }
}

export default PathUtil;
