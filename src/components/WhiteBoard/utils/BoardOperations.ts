import { Board, BoardElement, Operation, Path } from "../types";
import BoardUtil from "./BoardUtil";
import PathUtil from "./PathUtil";

const NORMALIZED_OPERATION = Symbol("BoardOperationsNormalizedOperation");

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
    operations: Operation[];
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
      return { data: result, metadata, operations: [] };
    }

    const operationsAreNormalized = operations.every((op) =>
      BoardOperations.isNormalizedOperation(op),
    );

    const preparedOps = operationsAreNormalized
      ? operations.map((op) => BoardOperations.cloneOperation(op, true))
      : BoardOperations.preprocessOperations(operations);

    const executedOperations: Operation[] = [];
    BoardOperations.executeOperations(
      result,
      preparedOps,
      metadata,
      {
        readonly,
        skipSelectionOperations,
        skipViewPortOperations,
      },
      executedOperations,
      !operationsAreNormalized,
    );

    return { data: result, metadata, operations: executedOperations };
  }

  static applyToChildren(
    children: BoardElement[],
    operations: Operation[],
    options: {
      readonly?: boolean;
      skipViewPortOperations?: boolean;
      skipSelectionOperations?: boolean;
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
    const normalizedOps = operations.map((op) =>
      BoardOperations.cloneOperation(op, true),
    );
    normalizedOps.forEach((op) => BoardOperations.markAsNormalized(op));

    const result = this.applyOperations({ children }, normalizedOps, {
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
    const validOps = PathUtil.filterValidOperations(operations, (op) =>
      BoardOperations.isNormalizedOperation(op),
    );
    if (validOps.length === 0) return [];

    // 第二步：简化排序（只对插入操作按深度排序）
    const sortedOps = PathUtil.sortOperationsForExecution(validOps);

    return sortedOps.map((op) => BoardOperations.cloneOperation(op, true));
  }

  private static executeOperations(
    state: {
      children: BoardElement[];
      viewPort?: Board["viewPort"];
      selection?: Board["selection"];
    },
    operations: Operation[],
    metadata: {
      changedElements: BoardElement[];
      removedElements: BoardElement[];
      hasChanges: boolean;
    },
    options: {
      readonly: boolean;
      skipSelectionOperations: boolean;
      skipViewPortOperations: boolean;
    },
    executedOperations: Operation[],
    enablePathTracking: boolean,
  ): void {
    if (operations.length === 0) return;

    if (!enablePathTracking) {
      for (const op of operations) {
        const cloned = BoardOperations.cloneOperation(op, true);
        const applied = BoardOperations.applySingleOperation(
          state,
          cloned,
          metadata,
          options,
        );

        if (applied) {
          BoardOperations.markAsNormalized(cloned);
          executedOperations.push(cloned);
        }
      }
      return;
    }

    const manager = new OperationPathRefManager();
    const operationRefs = operations.map((op) =>
      BoardOperations.isNormalizedOperation(op)
        ? { pathRef: null, newPathRef: null }
        : BoardOperations.createOperationRefs(op, manager),
    );

    for (let i = 0; i < operations.length; i++) {
      const template = operations[i];
      const cloned = BoardOperations.cloneOperation(template, true);
      const { pathRef, newPathRef } = operationRefs[i];
      const originalPath = BoardOperations.operationHasPath(template)
        ? [...template.path]
        : null;
      const originalNewPath =
        template.type === "move_node"
          ? [...(template as Extract<Operation, { type: "move_node" }>).newPath]
          : null;

      if (BoardOperations.isNormalizedOperation(cloned)) {
        // if (process.env.DEBUG_BOARD_OPS) {
        //   console.log("Applying normalized", cloned.type, "at path", (cloned as any).path);
        // }
        const applied = BoardOperations.applySingleOperation(
          state,
          cloned,
          metadata,
          options,
          {
            originalPath,
            originalNewPath,
          },
        );

        pathRef?.unref();
        newPathRef?.unref();

        if (applied) {
          executedOperations.push(cloned);
          manager.transform(cloned);
        }
        continue;
      }

      if (pathRef) {
        if (!pathRef.current) {
          pathRef.unref();
          newPathRef?.unref();
          continue;
        }
        if (BoardOperations.operationHasPath(cloned)) {
          cloned.path = [...pathRef.current];
        }
      }

      if (cloned.type === "move_node") {
        if (!newPathRef?.current) {
          pathRef?.unref();
          newPathRef?.unref();
          continue;
        }

        (cloned as Extract<Operation, { type: "move_node" }>).newPath = [
          ...newPathRef.current,
        ];
      }

      // if (process.env.DEBUG_BOARD_OPS) {
      //   console.log("Applying", cloned.type, "at path", (cloned as any).path);
      // }

      const applied = BoardOperations.applySingleOperation(
        state,
        cloned,
        metadata,
        options,
        {
          originalPath,
          originalNewPath,
        },
      );

      pathRef?.unref();
      newPathRef?.unref();

      if (applied) {
        BoardOperations.markAsNormalized(cloned);
        executedOperations.push(cloned);
        manager.transform(cloned);
      }
    }
  }

  private static applySingleOperation(
    state: {
      children: BoardElement[];
      viewPort?: Board["viewPort"];
      selection?: Board["selection"];
    },
    op: Operation,
    metadata: {
      changedElements: BoardElement[];
      removedElements: BoardElement[];
      hasChanges: boolean;
    },
    options: {
      readonly: boolean;
      skipSelectionOperations: boolean;
      skipViewPortOperations: boolean;
    },
    context?: {
      originalPath?: Path | null;
      originalNewPath?: Path | null;
    },
  ): boolean {
    switch (op.type) {
      case "set_node": {
        if (options.readonly) return false;

        const node = BoardOperations.ensureMutableNode(state, op.path);
        if (!node) return false;

        const { newProperties } = op;
        for (const key in newProperties) {
          const value = newProperties[key];
          if (value == null) {
            delete node[key];
          } else {
            node[key] = value;
          }
        }

        BoardUtil.dfs(node, (child) => {
          metadata.changedElements.push(child);
        });
        metadata.hasChanges = true;
        return true;
      }
      case "insert_node": {
        if (options.readonly) return false;

        const containerInfo = BoardOperations.resolveContainer(
          state,
          op.path,
          true,
        );
        if (!containerInfo) return false;

        let index = op.path[op.path.length - 1];
        const originalIndex =
          context?.originalPath &&
          context.originalPath.length === op.path.length
            ? context.originalPath[context.originalPath.length - 1]
            : null;
        if (index > containerInfo.container.length) {
          const canAppend =
            originalIndex != null &&
            originalIndex <= containerInfo.container.length;
          if (canAppend) {
            index = containerInfo.container.length;
            op.path = [...op.path];
            op.path[op.path.length - 1] = index;
          } else {
            console.error("insert_node error: index out of range", {
              path: op.path,
              index,
            });
            return false;
          }
        }

        containerInfo.container.splice(
          index,
          0,
          BoardOperations.cloneElement(op.node),
        );
        metadata.hasChanges = true;
        return true;
      }
      case "remove_node": {
        if (options.readonly) return false;

        const containerInfo = BoardOperations.resolveContainer(state, op.path);
        if (!containerInfo) return false;

        const index = op.path[op.path.length - 1];
        if (index >= containerInfo.container.length) {
          return false;
        }

        const [removed] = containerInfo.container.splice(index, 1);
        if (!removed) {
          return false;
        }

        metadata.removedElements.push(removed);
        metadata.hasChanges = true;
        return true;
      }
      case "move_node": {
        if (options.readonly) return false;

        const sourceInfo = BoardOperations.resolveContainer(state, op.path);
        if (!sourceInfo) return false;

        const sourceIndex = op.path[op.path.length - 1];
        if (sourceIndex >= sourceInfo.container.length) {
          return false;
        }

        const [elementToMove] = sourceInfo.container.splice(sourceIndex, 1);
        if (!elementToMove) {
          return false;
        }

        const targetInfo = BoardOperations.resolveContainer(
          state,
          op.newPath,
          true,
        );

        if (!targetInfo) {
          sourceInfo.container.splice(sourceIndex, 0, elementToMove);
          return false;
        }

        let targetIndex = op.newPath[op.newPath.length - 1];
        if (targetIndex > targetInfo.container.length) {
          targetIndex = targetInfo.container.length;
        }

        // 同步更新 newPath，确保后续 PathRef/metadata 得到实际落点
        op.newPath = [...op.newPath];
        op.newPath[op.newPath.length - 1] = targetIndex;

        targetInfo.container.splice(targetIndex, 0, elementToMove);
        metadata.hasChanges = true;
        return true;
      }
      case "set_viewport": {
        if (options.skipViewPortOperations || !state.viewPort) {
          return false;
        }

        const { newProperties } = op;
        for (const key in newProperties) {
          const value = newProperties[key];
          if (value == null) {
            delete state.viewPort[key];
          } else {
            state.viewPort[key] = value;
          }
        }

        metadata.hasChanges = true;
        return true;
      }
      case "set_selection": {
        if (
          options.readonly ||
          options.skipSelectionOperations ||
          !state.selection
        ) {
          return false;
        }

        const { newProperties } = op;
        for (const key in newProperties) {
          const value = newProperties[key];
          if (value == null) {
            delete state.selection[key];
          } else {
            state.selection[key] = value;
          }
        }

        metadata.hasChanges = true;
        return true;
      }
      default:
        return false;
    }
  }

  static markAsNormalized(operation: Operation): void {
    Object.defineProperty(operation, NORMALIZED_OPERATION, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }

  static isNormalizedOperation(operation: Operation): boolean {
    return Boolean((operation as any)[NORMALIZED_OPERATION]);
  }

  private static cloneOperation(
    operation: Operation,
    preserveNormalization = false,
  ): Operation {
    const cloned = { ...operation } as Operation;

    if (BoardOperations.operationHasPath(cloned)) {
      cloned.path = [...cloned.path];
    }

    if (cloned.type === "move_node") {
      cloned.newPath = [...cloned.newPath];
    }

    if (
      preserveNormalization &&
      BoardOperations.isNormalizedOperation(operation)
    ) {
      BoardOperations.markAsNormalized(cloned);
    }

    return cloned;
  }

  private static cloneElement(element: BoardElement): BoardElement {
    return JSON.parse(JSON.stringify(element));
  }

  private static resolveContainer(
    state: {
      children: BoardElement[];
    },
    path: Path,
    createChildren = false,
  ): { container: BoardElement[]; parent?: BoardElement } | null {
    if (path.length === 0) {
      return null;
    }

    if (path.length === 1) {
      if (!Object.isExtensible(state.children)) {
        state.children = [...state.children];
      }
      return { container: state.children };
    }

    const parentPath = path.slice(0, -1);
    const parent = BoardOperations.ensureMutableNode(state, parentPath);
    if (!parent) {
      return null;
    }

    if (!parent.children) {
      if (createChildren) {
        parent.children = [];
      } else {
        return null;
      }
    }

    if (!Object.isExtensible(parent.children)) {
      parent.children = [...parent.children];
    }

    return { container: parent.children!, parent };
  }

  private static ensureMutableNode(
    state: {
      children: BoardElement[];
    },
    path: Path,
  ): BoardElement | null {
    if (path.length === 0) return null;

    const containerInfo = BoardOperations.resolveContainer(state, path);
    if (!containerInfo) return null;
    const index = path[path.length - 1];
    const node = containerInfo.container[index];
    if (!node) return null;

    if (!Object.isExtensible(node)) {
      const cloned = BoardOperations.cloneElement(node);
      containerInfo.container[index] = cloned;
      return cloned;
    }

    return node;
  }

  static operationHasPath(
    operation: Operation,
  ): operation is Extract<Operation, { path: Path }> {
    return (
      operation.type === "insert_node" ||
      operation.type === "remove_node" ||
      operation.type === "move_node" ||
      operation.type === "set_node"
    );
  }

  private static createOperationRefs(
    operation: Operation,
    manager: OperationPathRefManager,
  ): {
    pathRef: OperationPathRef | null;
    newPathRef: OperationPathRef | null;
  } {
    const shouldTrackPath = BoardOperations.operationHasPath(operation);
    const pathRef = shouldTrackPath
      ? manager.track((operation as any).path, operation.type)
      : null;
    const newPathRef =
      operation.type === "move_node"
        ? manager.track(
            (operation as Extract<Operation, { type: "move_node" }>).newPath,
            operation.type,
          )
        : null;

    return { pathRef, newPathRef };
  }
}

type OperationPathRef = {
  current: Path | null;
  targetType: Operation["type"];
  unref: () => Path | null;
};

class OperationPathRefManager {
  private refs = new Set<OperationPathRef>();

  track(path: Path, targetType: Operation["type"]): OperationPathRef | null {
    if (!path || path.length === 0) {
      return null;
    }

    const copy = [...path];
    const ref: OperationPathRef = {
      current: copy,
      targetType,
      unref: () => {
        this.refs.delete(ref);
        const value = ref.current;
        ref.current = null;
        return value;
      },
    };

    this.refs.add(ref);
    return ref;
  }

  transform(operation: Operation): void {
    if (!BoardOperations.operationHasPath(operation)) {
      return;
    }

    const refs = Array.from(this.refs);
    for (const ref of refs) {
      if (!ref.current) continue;

      const next = PathUtil.transformPath(
        ref.current,
        operation,
        ref.targetType,
      );
      if (next === null) {
        ref.current = null;
        this.refs.delete(ref);
      } else {
        ref.current = next;
      }
    }
  }
}

export default BoardOperations;
