import { BoardElement, Operation, Board } from "../types";
import PathUtil from "./PathUtil";

/**
 * MockBoard类型，用于模拟Board结构
 * 仅包含必要的children属性，用于操作处理
 */
interface MockBoard {
  children: BoardElement[];
}

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
      viewPort?: Record<string, unknown>;
      selection?: Record<string, unknown>;
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
      viewPort?: Record<string, unknown>;
      selection?: Record<string, unknown>;
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

    // 第一步：过滤无效操作
    const validOps = PathUtil.filterValidOperations(operations);
    if (validOps.length === 0) {
      return { data: result, metadata };
    }

    // 第二步：对有效操作进行排序
    const sortedOps = PathUtil.sortOperationsForExecution(validOps);

    // 第三步：转换排序后的操作路径
    const transformedOps = PathUtil.transformValidOperations(sortedOps);

    // 创建模拟的Board结构用于路径操作
    const mockBoard: MockBoard = { children: result.children };

    try {
      for (const op of transformedOps) {
        if (op.type === "set_node") {
          if (readonly) continue;

          const { path, newProperties, properties } = op;
          // 使用getElement替代getElementByPath，避免Board类型问题
          const pathCopy = [...path];
          const firstIndex = pathCopy.shift();
          if (
            firstIndex === undefined ||
            firstIndex >= mockBoard.children.length
          )
            continue;

          let node = mockBoard.children[firstIndex];
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

          // 不删除原来的属性，只更新新属性中指定要修改的

          metadata.changedElements.push(node);
          metadata.hasChanges = true;
        } else if (op.type === "insert_node") {
          if (readonly) continue;

          const { path, node } = op;
          // 手动处理路径以获取父节点
          if (path.length === 1) {
            // 顶层插入
            const index = path[0];
            if (index <= mockBoard.children.length) {
              mockBoard.children.splice(
                index,
                0,
                JSON.parse(JSON.stringify(node)),
              );
              metadata.hasChanges = true;
            } else {
              console.error("insert_node error: index out of range", {
                path,
                index,
                parent: mockBoard,
              });
            }
          } else {
            // 子节点插入
            const parentPath = path.slice(0, -1);
            const insertIndex = path[path.length - 1];

            // 使用getElement获取父节点
            const pathCopy = [...parentPath];
            const firstIndex = pathCopy.shift();
            if (
              firstIndex === undefined ||
              firstIndex >= mockBoard.children.length
            )
              continue;

            let parent = mockBoard.children[firstIndex];
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
            if (index < mockBoard.children.length) {
              const removedElement = mockBoard.children[index];
              metadata.removedElements.push(removedElement);
              mockBoard.children.splice(index, 1);
              metadata.hasChanges = true;
            }
          } else {
            // 子节点删除
            const parentPath = path.slice(0, -1);
            const removeIndex = path[path.length - 1];

            // 使用getElement获取父节点
            const pathCopy = [...parentPath];
            const firstIndex = pathCopy.shift();
            if (
              firstIndex === undefined ||
              firstIndex >= mockBoard.children.length
            )
              continue;

            let parent = mockBoard.children[firstIndex];
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
   * 简化版本：仅应用到children数组（用于BoardUtil.apply）
   */
  static applyToChildren(
    children: BoardElement[],
    operations: Operation[],
    options: { readonly?: boolean } = {},
  ): BoardElement[] {
    const result = this.applyOperations({ children }, operations, {
      ...options,
      skipViewPortOperations: true,
      skipSelectionOperations: true,
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

    // 第二步：排序
    const sortedOps = PathUtil.sortOperationsForExecution(validOps);

    // 第三步：路径转换
    const transformedOps = PathUtil.transformValidOperations(sortedOps);

    return transformedOps;
  }
}

export default BoardOperations;
