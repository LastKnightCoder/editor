import { Board, BoardElement, Operation } from "../types";
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

    // 第一步：过滤无效操作
    const validOps = PathUtil.filterValidOperations(operations);
    if (validOps.length === 0) {
      return { data: result, metadata };
    }

    // 第二步：简化排序（只对插入操作按深度排序）
    const sortedOps = PathUtil.sortOperationsForExecution(validOps);

    // 第三步：根据skipPathTransform选项决定是否进行路径转换
    const transformedOps = skipPathTransform
      ? sortedOps
      : PathUtil.transformValidOperations(sortedOps);

    const board = { children: result.children };

    try {
      for (const op of transformedOps) {
        if (op.type === "set_node") {
          if (readonly) continue;

          const { path, newProperties } = op;
          // 使用getElement替代getElementByPath，避免Board类型问题
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
            if (value === null) {
              delete node[key];
            } else {
              node[key] = value;
            }
          }

          metadata.changedElements.push(node);
          metadata.hasChanges = true;
        } else if (op.type === "insert_node") {
          if (readonly) continue;

          const { path, node } = op;
          // 手动处理路径以获取父节点
          if (path.length === 1) {
            // 顶层插入
            const index = path[0];
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

          // Move操作实现：先删除源位置的元素，再插入到目标位置
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
                elementToMove = sourceParent.children[sourceIndex];
                sourceParent.children.splice(sourceIndex, 1);
              }
            }
          }

          // 第二步：插入到目标位置
          if (elementToMove) {
            if (newPath.length === 1) {
              // 顶层插入
              const targetIndex = newPath[0];
              if (targetIndex <= board.children.length) {
                board.children.splice(targetIndex, 0, elementToMove);
                metadata.hasChanges = true;
              }
            } else {
              // 子节点插入
              const targetParentPath = newPath.slice(0, -1);
              const targetIndex = newPath[newPath.length - 1];

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
  ): BoardElement[] {
    // diff 生成的操作需要跳过路径转换
    const result = this.applyOperations({ children }, operations, {
      skipViewPortOperations: true,
      skipSelectionOperations: true,
      skipPathTransform: true, // 关键：跳过路径转换
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

  /**
   * 专门用于undo/redo的应用方法：不进行路径转换
   *
   * 这个方法用于应用已经经过路径转换验证的操作（如从历史记录中取出的操作）
   * 不进行路径转换，避免二次转换导致的错误
   */
  static applyUndoOperations(
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

    // 直接应用操作，不进行任何路径转换
    // 因为这些操作已经是经过转换验证的
    const board = { children: result.children };

    try {
      for (const op of operations) {
        if (op.type === "set_node") {
          if (readonly) continue;

          const { path, newProperties } = op;
          // 使用getElement替代getElementByPath，避免Board类型问题
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
            if (value === null) {
              delete node[key];
            } else {
              node[key] = value;
            }
          }

          metadata.changedElements.push(node);
          metadata.hasChanges = true;
        } else if (op.type === "insert_node") {
          if (readonly) continue;

          const { path, node } = op;
          // 手动处理路径以获取父节点
          if (path.length === 1) {
            // 顶层插入
            const index = path[0];
            if (index <= board.children.length) {
              board.children.splice(index, 0, JSON.parse(JSON.stringify(node)));
              metadata.hasChanges = true;
            } else {
              console.error("undo insert_node error: index out of range", {
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

            // 插入节点
            if (insertIndex <= parent.children.length) {
              parent.children.splice(
                insertIndex,
                0,
                JSON.parse(JSON.stringify(node)),
              );
              metadata.hasChanges = true;
            } else {
              console.error("undo insert_node error: index out of range", {
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

          // Move操作实现：先删除源位置的元素，再插入到目标位置
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
                elementToMove = sourceParent.children[sourceIndex];
                sourceParent.children.splice(sourceIndex, 1);
              }
            }
          }

          // 第二步：插入到目标位置
          if (elementToMove) {
            if (newPath.length === 1) {
              // 顶层插入
              const targetIndex = newPath[0];
              if (targetIndex <= board.children.length) {
                board.children.splice(targetIndex, 0, elementToMove);
                metadata.hasChanges = true;
              }
            } else {
              // 子节点插入
              const targetParentPath = newPath.slice(0, -1);
              const targetIndex = newPath[newPath.length - 1];

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
      console.error("Apply undo operations error:", e);
    }

    return { data: result, metadata };
  }
}

export default BoardOperations;
