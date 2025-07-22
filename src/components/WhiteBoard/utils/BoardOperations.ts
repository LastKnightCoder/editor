import { Board, BoardElement, Operation } from "../types";
import BoardUtil from "./BoardUtil";
import PathUtil from "./PathUtil";

/**
 * BoardOperations - 白板操作核心逻辑
 *
 * 这个类包含了从 Board.tsx 中抽离出来的核心操作逻辑，
 * 使其可以独立测试且被多个地方复用。
 */
export class BoardOperations {
  /**
   * 应用操作列表到数据结构（纯函数版本）
   *
   * @param data 要操作的数据结构，包含 children, viewPort, selection
   * @param operations 操作列表
   * @param options 可选配置
   * @returns 应用操作后的新数据结构和元数据
   */
  static applyOperations(
    data: {
      children: BoardElement[];
      viewPort?: Board["viewPort"];
      selection?: Board["selection"];
    },
    operations: Operation[],
    options: {
      readonly?: boolean;
      skipViewPortOperations?: boolean;
      skipSelectionOperations?: boolean;
      skipPathTransform?: boolean;
      skipPreprocessing?: boolean;
    } = {},
  ): {
    data: {
      children: BoardElement[];
      viewPort?: Board["viewPort"];
      selection?: Board["selection"];
    };
    metadata: {
      changedElements: BoardElement[];
      removedElements: BoardElement[];
      hasChanges: boolean;
    };
  } {
    const {
      readonly = false,
      skipViewPortOperations = false,
      skipSelectionOperations = false,
      skipPathTransform = false,
      skipPreprocessing = false,
    } = options;

    // 深克隆输入数据以避免副作用
    const result = {
      children: JSON.parse(JSON.stringify(data.children)),
      viewPort: data.viewPort
        ? JSON.parse(JSON.stringify(data.viewPort))
        : undefined,
      selection: data.selection
        ? JSON.parse(JSON.stringify(data.selection))
        : undefined,
    };

    // 元数据收集
    const metadata = {
      changedElements: [] as BoardElement[],
      removedElements: [] as BoardElement[],
      hasChanges: false,
    };

    if (operations.length === 0) {
      return { data: result, metadata };
    }

    // 预处理步骤：根据 skipPreprocessing 选项决定是否进行过滤和排序
    let processedOps: Operation[];

    if (skipPreprocessing) {
      // 跳过所有预处理，直接使用原始操作
      processedOps = operations;
    } else {
      // 第一步：过滤无效操作
      const validOps = PathUtil.filterValidOperations(operations);
      if (validOps.length === 0) {
        return { data: result, metadata };
      }

      // 第二步：简化排序（只对插入操作按深度排序）
      const sortedOps = PathUtil.sortOperationsForExecution(validOps);

      // 第三步：根据skipPathTransform选项决定是否进行路径转换
      processedOps = skipPathTransform
        ? sortedOps
        : PathUtil.transformValidOperations(sortedOps);
    }

    const board = { children: result.children };

    try {
      for (const op of processedOps) {
        if (op.type === "set_node") {
          if (readonly) continue;

          const { path, newProperties } = op;
          const pathCopy = [...path];
          const firstIndex = pathCopy.shift();
          if (firstIndex === undefined || firstIndex >= board.children.length)
            continue;

          let node = board.children[firstIndex];
          for (const idx of pathCopy) {
            if (!node.children || idx >= node.children.length) {
              continue;
            }
            node = node.children[idx];
          }

          if (!node) continue;

          // 应用新属性
          for (const key in newProperties) {
            const value = newProperties[key];
            node[key] = value;
          }

          // 有的时候会通过 set_node 修改子元素，无法区分修改了哪些，暂时全部认为更新了
          BoardUtil.dfs(node, (child) => {
            metadata.changedElements.push(child);
          });
          metadata.hasChanges = true;
        } else if (op.type === "insert_node") {
          if (readonly) continue;

          const { path, node } = op;
          // 手动处理路径以获取父节点
          if (path.length === 1) {
            // 顶层插入
            const index = path[0];

            // 检查数组是否可扩展，如果不可扩展则创建新的副本
            if (!Object.isExtensible(board.children)) {
              board.children = [...board.children];
            }

            if (index <= board.children.length) {
              board.children.splice(index, 0, JSON.parse(JSON.stringify(node)));
              metadata.hasChanges = true;
            } else {
              console.error("insert_node error: index out of range", {
                path,
                index,
                parent: board,
              });
            }
          } else {
            // 子节点插入
            const parentPath = path.slice(0, -1);
            const insertIndex = path[path.length - 1];

            // 使用getElement获取父节点
            const pathCopy = [...parentPath];
            const firstIndex = pathCopy.shift();
            if (firstIndex === undefined || firstIndex >= board.children.length)
              continue;

            let parent = board.children[firstIndex];
            for (const idx of pathCopy) {
              if (!parent.children || idx >= parent.children.length) {
                parent = null as unknown as BoardElement;
                break;
              }
              parent = parent.children[idx];
            }

            if (!parent) continue;
            if (!parent.children) {
              parent.children = [];
            }

            // 检查数组是否可扩展，如果不可扩展则创建新的副本
            if (!Object.isExtensible(parent.children)) {
              parent.children = [...parent.children];
            }

            // 插入节点
            if (insertIndex <= parent.children.length) {
              parent.children.splice(
                insertIndex,
                0,
                JSON.parse(JSON.stringify(node)),
              );
              metadata.hasChanges = true;
            } else {
              console.error("insert_node error: index out of range", {
                path,
                index: insertIndex,
                parent,
              });
            }
          }
        } else if (op.type === "remove_node") {
          if (readonly) continue;

          const { path } = op;
          // 手动处理路径以获取父节点
          if (path.length === 1) {
            // 顶层删除
            const index = path[0];
            if (index < board.children.length) {
              const removedElement = board.children[index];
              metadata.removedElements.push(removedElement);
              board.children.splice(index, 1);
              metadata.hasChanges = true;
            }
          } else {
            // 子节点删除
            const parentPath = path.slice(0, -1);
            const removeIndex = path[path.length - 1];

            // 使用getElement获取父节点
            const pathCopy = [...parentPath];
            const firstIndex = pathCopy.shift();
            if (firstIndex === undefined || firstIndex >= board.children.length)
              continue;

            let parent = board.children[firstIndex];
            for (const idx of pathCopy) {
              if (!parent.children || idx >= parent.children.length) {
                parent = null as unknown as BoardElement;
                break;
              }
              parent = parent.children[idx];
            }

            if (!parent || !parent.children) continue;

            // 删除节点
            if (removeIndex < parent.children.length) {
              const removedElement = parent.children[removeIndex];
              metadata.removedElements.push(removedElement);
              if (!Object.isExtensible(parent.children)) {
                parent.children = [...parent.children];
              }
              parent.children.splice(removeIndex, 1);
              metadata.hasChanges = true;
            }
          }
        } else if (op.type === "move_node") {
          if (readonly) continue;

          const { path, newPath } = op as Extract<
            Operation,
            { type: "move_node" }
          >;

          /**
           * 修复：处理移动操作中的索引调整问题
           *
           * 问题：在数组移动操作中，先删除源元素再插入目标位置会导致索引偏移
           * 场景1：同层级移动 [1] → [4]，删除后目标位置变成 [3]
           * 场景2：跨层级移动 [3] → [4,0]，删除后父级位置变成 [3,0]
           */
          const adjustedNewPath = [...newPath];

          // 检查是否为同层级移动
          const isSameLevel =
            path.length === newPath.length &&
            path.slice(0, -1).every((val, idx) => val === newPath[idx]);

          if (isSameLevel) {
            // 同层级移动：调整目标索引
            const sourceIndex = path[path.length - 1];
            const targetIndex = newPath[newPath.length - 1];

            // 如果源索引小于目标索引，删除源元素后目标索引需要减1
            if (sourceIndex < targetIndex) {
              adjustedNewPath[adjustedNewPath.length - 1] = targetIndex - 1;
            }
          } else {
            // 跨层级移动：调整受影响的父级索引
            // 逐层检查源路径是否影响目标路径中的父级索引
            for (let i = 0; i < adjustedNewPath.length - 1; i++) {
              // 构建当前层级的路径片段进行比较
              const currentLevelPath = path.slice(0, i + 1);
              const targetLevelPath = adjustedNewPath.slice(0, i + 1);

              // 检查当前层级是否为同级操作
              if (currentLevelPath.length === targetLevelPath.length) {
                const areSameParent = currentLevelPath
                  .slice(0, -1)
                  .every((val, idx) => val === targetLevelPath[idx]);

                if (areSameParent) {
                  const sourceIdx =
                    currentLevelPath[currentLevelPath.length - 1];
                  const targetIdx = targetLevelPath[targetLevelPath.length - 1];

                  // 如果源索引小于目标索引，目标索引需要减1
                  if (sourceIdx < targetIdx) {
                    adjustedNewPath[i] = targetIdx - 1;
                  }
                }
              }
            }
          }

          // Move操作实现：先删除源位置的元素，再插入到调整后的目标位置
          let elementToMove: BoardElement | null = null;

          // 第一步：从源位置删除元素
          if (path.length === 1) {
            // 顶层移动
            const sourceIndex = path[0];
            if (sourceIndex < board.children.length) {
              elementToMove = board.children[sourceIndex];
              board.children.splice(sourceIndex, 1);
            }
          } else {
            // 子节点移动
            const sourceParentPath = path.slice(0, -1);
            const sourceIndex = path[path.length - 1];

            // 获取源父节点
            const pathCopy = [...sourceParentPath];
            const firstIndex = pathCopy.shift();
            if (
              firstIndex !== undefined &&
              firstIndex < board.children.length
            ) {
              let sourceParent = board.children[firstIndex];
              for (const idx of pathCopy) {
                if (
                  !sourceParent.children ||
                  idx >= sourceParent.children.length
                ) {
                  sourceParent = null as unknown as BoardElement;
                  break;
                }
                sourceParent = sourceParent.children[idx];
              }

              if (
                sourceParent?.children &&
                sourceIndex < sourceParent.children.length
              ) {
                if (!Object.isExtensible(sourceParent.children)) {
                  sourceParent.children = [...sourceParent.children];
                }
                elementToMove = sourceParent.children[sourceIndex];
                sourceParent.children.splice(sourceIndex, 1);
              }
            }
          }

          // 第二步：插入到调整后的目标位置
          if (elementToMove) {
            if (adjustedNewPath.length === 1) {
              // 顶层插入
              const targetIndex = adjustedNewPath[0];

              // 检查数组是否可扩展，如果不可扩展则创建新的副本
              if (!Object.isExtensible(board.children)) {
                board.children = [...board.children];
              }

              if (targetIndex <= board.children.length) {
                board.children.splice(targetIndex, 0, elementToMove);
                metadata.hasChanges = true;
              }
            } else {
              // 子节点插入
              const targetParentPath = adjustedNewPath.slice(0, -1);
              const targetIndex = adjustedNewPath[adjustedNewPath.length - 1];

              // 获取目标父节点
              const pathCopy = [...targetParentPath];
              const firstIndex = pathCopy.shift();
              if (
                firstIndex !== undefined &&
                firstIndex < board.children.length
              ) {
                let targetParent = board.children[firstIndex];
                for (const idx of pathCopy) {
                  if (
                    !targetParent.children ||
                    idx >= targetParent.children.length
                  ) {
                    targetParent = null as unknown as BoardElement;
                    break;
                  }
                  targetParent = targetParent.children[idx];
                }

                if (targetParent) {
                  if (!targetParent.children) {
                    targetParent.children = [];
                  }

                  // 检查数组是否可扩展，如果不可扩展则创建新的副本
                  if (!Object.isExtensible(targetParent.children)) {
                    targetParent.children = [...targetParent.children];
                  }

                  if (targetIndex <= targetParent.children.length) {
                    targetParent.children.splice(targetIndex, 0, elementToMove);
                    metadata.hasChanges = true;
                  }
                }
              }
            }
          }
        } else if (op.type === "set_viewport") {
          if (skipViewPortOperations || !result.viewPort) continue;

          const { newProperties } = op;
          for (const key in newProperties) {
            const value = newProperties[key];
            if (value == null) {
              delete result.viewPort[key];
            } else {
              result.viewPort[key] = value;
            }
          }
          metadata.hasChanges = true;
        } else if (op.type === "set_selection") {
          if (readonly || skipSelectionOperations || !result.selection)
            continue;

          const { newProperties } = op;
          for (const key in newProperties) {
            const value = newProperties[key];
            if (value == null) {
              delete result.selection[key];
            } else {
              result.selection[key] = value;
            }
          }
          metadata.hasChanges = true;
        }
      }
    } catch (e) {
      console.error("Apply operations error:", e);
    }

    return { data: result, metadata };
  }

  /**
   * 简化的应用操作到子节点数组的方法（纯函数）
   * @param children 原始子节点数组
   * @param operations 操作列表
   * @returns 新的子节点数组
   */
  static applyToChildren(
    children: BoardElement[],
    operations: Operation[],
    options: {
      readonly?: boolean;
      skipViewPortOperations?: boolean;
      skipSelectionOperations?: boolean;
      skipPathTransform?: boolean;
      skipPreprocessing?: boolean;
    } = {},
  ): BoardElement[] {
    const result = this.applyOperations({ children }, operations, {
      skipViewPortOperations: true,
      skipSelectionOperations: true,
      ...options,
    });

    return result.data.children;
  }

  /**
   * 专门用于应用 diff 算法生成的操作
   * 这些操作已经经过预处理，需要按原始顺序直接执行
   */
  static applyDiffOperations(
    children: BoardElement[],
    operations: Operation[],
  ): BoardElement[] {
    const result = this.applyOperations({ children }, operations, {
      skipViewPortOperations: true,
      skipSelectionOperations: true,
      skipPathTransform: true,
      skipPreprocessing: true,
    });

    return result.data.children;
  }

  /**
   * 预处理操作：过滤、排序、转换
   * 这是Board.apply方法中的核心预处理逻辑
   */
  static preprocessOperations(operations: Operation[]): Operation[] {
    if (operations.length === 0) return [];

    // 第一步：过滤无效操作
    const validOps = PathUtil.filterValidOperations(operations);
    if (validOps.length === 0) return [];

    // 第二步：简化排序（只对插入操作按深度排序）
    const sortedOps = PathUtil.sortOperationsForExecution(validOps);

    // 第三步：路径转换
    // 检查是否有操作标记了skipPathTransform
    const hasSkipTransformFlag = sortedOps.some(
      (op) => (op as any).skipPathTransform,
    );

    const transformedOps = hasSkipTransformFlag
      ? sortedOps.map((op) => {
          // 移除标记，返回干净的操作
          const { skipPathTransform, ...cleanOp } = op as any;
          return cleanOp;
        })
      : PathUtil.transformValidOperations(sortedOps);

    return transformedOps;
  }
}

export default BoardOperations;
