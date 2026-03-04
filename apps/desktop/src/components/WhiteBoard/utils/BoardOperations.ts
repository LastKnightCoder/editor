import { Board, BoardElement, Operation, Path } from "../types";
import PathUtil from "./PathUtil";

const NORMALIZED_OPERATION = Symbol("BoardOperationsNormalizedOperation");

type OperationMetadata = {
  changedElements: BoardElement[];
  removedElements: BoardElement[];
  insertedElements: BoardElement[];
  hasChanges: boolean;
};

export class BoardOperations {
  // 仅用于测试/诊断：允许通过全局变量强制指定“是否 DEV”。
  // 线上不应设置该值；未设置时仍以 import.meta.env.DEV 为准。
  private static isDevEnvironment(): boolean {
    const forced = (
      globalThis as unknown as { __TAU_WHITEBOARD_FORCE_DEV__?: unknown }
    ).__TAU_WHITEBOARD_FORCE_DEV__;
    if (typeof forced === "boolean") return forced;
    return Boolean((import.meta as any).env?.DEV);
  }

  // 迁移期：用于去重 `set_node` 携带 children 的 warning，避免拖拽等高频场景刷屏。
  private static readonly setNodeChildrenWarningDedup = new Set<string>();

  private static warnIfSetNodeContainsChildren(
    op: Extract<Operation, { type: "set_node" }>,
    node: BoardElement,
  ): void {
    const hasChildrenInProps = Object.prototype.hasOwnProperty.call(
      op.properties ?? {},
      "children",
    );
    const hasChildrenInNewProps = Object.prototype.hasOwnProperty.call(
      op.newProperties ?? {},
      "children",
    );
    if (!hasChildrenInProps && !hasChildrenInNewProps) return;

    const isDev = BoardOperations.isDevEnvironment();
    const propsKeys = Object.keys(op.properties ?? {}).sort();
    const newPropsKeys = Object.keys(op.newProperties ?? {}).sort();

    // 最终门禁：禁止通过 set_node 写 children
    // - 开发环境：直接抛异常，强制迁移
    // - 生产环境：打印一次 warning，便于线上回溯但不中断用户操作
    if (isDev) {
      const error = new Error(
        "[WhiteBoard][BoardOperations] 禁止 set_node(children)：请使用 insert_node/remove_node/move_node 表达结构变化；set_node 仅用于 patch 当前节点自身属性。",
      );
      (error as any).detail = {
        elementId: node.id,
        elementType: node.type,
        path: op.path,
        propertiesKeys: propsKeys,
        newPropertiesKeys: newPropsKeys,
      };
      throw error;
    }

    // 用“元素类型 + 传入字段形状”作为去重 key；同一类调用点只提示一次。
    const dedupKey = `${node.type}|${propsKeys.join(",")}|${newPropsKeys.join(",")}`;
    if (BoardOperations.setNodeChildrenWarningDedup.has(dedupKey)) return;
    BoardOperations.setNodeChildrenWarningDedup.add(dedupKey);

    const stack = new Error().stack;
    console.warn(
      "[WhiteBoard][BoardOperations] set_node 包含 children（迁移期警告）：请使用 insert_node/remove_node/move_node 表达结构变化；仅用 set_node 更新当前节点自身属性。",
      {
        elementId: node.id,
        elementType: node.type,
        path: op.path,
        propertiesKeys: propsKeys,
        newPropertiesKeys: newPropsKeys,
        stack,
      },
    );
  }

  private static dfsElement(
    node: BoardElement,
    visit: (node: BoardElement) => void,
  ): void {
    visit(node);
    const children = node.children;
    if (!children || children.length === 0) return;
    for (let i = 0; i < children.length; i++) {
      BoardOperations.dfsElement(children[i], visit);
    }
  }

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
    metadata: OperationMetadata;
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
    const metadata: OperationMetadata = {
      changedElements: [] as BoardElement[],
      removedElements: [] as BoardElement[],
      insertedElements: [] as BoardElement[],
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
    metadata: OperationMetadata,
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
        // move_node 在 apply 时会基于 remove(path) 计算真实落点。
        // PathRef 的 transform 需要使用“真实落点”的 newPath，否则后续 op 的 path/newPath 可能会被算错。
        // 但为了保证 history/undo/redo 的可重放性，executedOperations 仍保留原始 newPath（不在 apply 中改写）。
        if (cloned.type === "move_node") {
          const moveOp = cloned as Extract<Operation, { type: "move_node" }>;
          const adjusted = PathUtil.transformPath([...moveOp.newPath], {
            type: "remove_node",
            path: moveOp.path,
          } as Operation);

          if (adjusted) {
            manager.transform({
              ...moveOp,
              newPath: adjusted,
            });
          } else {
            manager.transform(cloned);
          }
        } else {
          manager.transform(cloned);
        }
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
    metadata: OperationMetadata,
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

        const setOp = op as Extract<Operation, { type: "set_node" }>;
        BoardOperations.warnIfSetNodeContainsChildren(setOp, node);

        const { newProperties } = setOp;
        for (const key in newProperties) {
          const value = newProperties[key];
          if (value == null) {
            delete node[key];
          } else {
            node[key] = value;
          }
        }

        const hasChildrenInProps = Object.prototype.hasOwnProperty.call(
          setOp.properties ?? {},
          "children",
        );
        const hasChildrenInNewProps = Object.prototype.hasOwnProperty.call(
          setOp.newProperties ?? {},
          "children",
        );
        // 迁移期兼容：只有当 set_node 明确携带 children（老逻辑）时才 DFS 记录子树变化。
        // 新逻辑下 set_node 只做 patch，此处只记录当前节点，避免大量 set_node 导致 O(n^2) 的 metadata 采集成本。
        if (hasChildrenInProps || hasChildrenInNewProps) {
          BoardOperations.dfsElement(node, (child) => {
            metadata.changedElements.push(child);
          });
        } else {
          metadata.changedElements.push(node);
        }
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
        const inserted = containerInfo.container[index];
        if (inserted) {
          // insertedElements 记录“扁平化后的子树”，便于全局 insert 事件/资源统计/参考线清理等场景按节点粒度处理。
          BoardOperations.dfsElement(inserted, (n) => {
            metadata.insertedElements.push(n);
          });
        }
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

        // removedElements 记录“扁平化后的子树”，避免只移除根节点导致子节点参考线/资源统计遗漏。
        BoardOperations.dfsElement(removed, (n) => {
          metadata.removedElements.push(n);
        });
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

        const adjustedNewPath =
          PathUtil.transformPath([...op.newPath], {
            type: "remove_node",
            path: op.path,
          } as Operation) ?? null;

        if (!adjustedNewPath) {
          return false;
        }

        const [elementToMove] = sourceInfo.container.splice(sourceIndex, 1);
        if (!elementToMove) {
          return false;
        }

        const targetInfo = BoardOperations.resolveContainer(
          state,
          adjustedNewPath,
          true,
        );

        if (!targetInfo) {
          sourceInfo.container.splice(sourceIndex, 0, elementToMove);
          return false;
        }

        let targetIndex = adjustedNewPath[adjustedNewPath.length - 1];
        if (targetIndex > targetInfo.container.length) {
          targetIndex = targetInfo.container.length;
        }

        // 注意：不要改写 op.newPath。
        // move_node 的 path/newPath 需要保持“同一快照”的语义（类似 Slate），否则 history/undo/redo 会失真。

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
