import { BoardElement, Operation, Selection, SetNodePatch } from "../types";
import Board from "../Board";
import BoardOperations from "./BoardOperations";
import SpatialHitIndex from "./SpatialHitIndex";
import { Path as SlatePath } from "slate";

export class BoardUtil {
  private static hitIndexCache = new WeakMap<
    Board,
    {
      version: number;
      index: SpatialHitIndex;
    }
  >();

  static isBoard(value: unknown): value is Board {
    return Boolean(value && (value as Board).boardFlag === Board.boardFlag);
  }

  static getHitElements(board: Board, x: number, y: number): BoardElement[] {
    try {
      const candidates = this.getSpatialIndex(board).queryPoint(x, y);
      return candidates.filter((node) => board.isHit(node, x, y));
    } catch (_error) {
      return this.getHitElementsByDFS(board, x, y);
    }
  }

  static getElementsInSelectArea(
    board: Board,
    selectArea: Selection["selectArea"],
  ): BoardElement[] {
    if (!selectArea) return [];

    const minX = Math.min(selectArea.anchor.x, selectArea.focus.x);
    const minY = Math.min(selectArea.anchor.y, selectArea.focus.y);
    const maxX = Math.max(selectArea.anchor.x, selectArea.focus.x);
    const maxY = Math.max(selectArea.anchor.y, selectArea.focus.y);

    try {
      const candidates = this.getSpatialIndex(board).queryRect(
        minX,
        minY,
        maxX,
        maxY,
      );
      return candidates.filter((node) =>
        board.isElementSelected(node, selectArea),
      );
    } catch (_error) {
      return this.getElementsInSelectAreaByDFS(board, selectArea);
    }
  }

  private static getSpatialIndex(board: Board): SpatialHitIndex {
    const version = board.getElementVersion();
    const cached = this.hitIndexCache.get(board);
    if (cached && cached.version === version) {
      return cached.index;
    }

    const index = new SpatialHitIndex(board);
    this.hitIndexCache.set(board, { version, index });
    return index;
  }

  private static getHitElementsByDFS(
    board: Board,
    x: number,
    y: number,
  ): BoardElement[] {
    const hitElements: BoardElement[] = [];
    this.dfs(board, (node) => {
      if (board.isHit(node, x, y)) {
        hitElements.push(node);
      }
    });
    return hitElements;
  }

  private static getElementsInSelectAreaByDFS(
    board: Board,
    selectArea: Selection["selectArea"],
  ): BoardElement[] {
    if (!selectArea) return [];

    const selectedElements: BoardElement[] = [];
    this.dfs(board, (node) => {
      if (board.isElementSelected(node, selectArea)) {
        selectedElements.push(node);
      }
    });
    return selectedElements;
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
    const ops: Operation[] = [];

    // 快速路径：相同引用直接返回空数组
    if (oldChildren === newChildren) {
      return ops;
    }

    // 快速路径：都为空数组
    if (oldChildren.length === 0 && newChildren.length === 0) {
      return ops;
    }

    // 内存优化：重用映射对象
    const oldMap = this.createElementMap(oldChildren);
    const newMap = this.createElementMap(newChildren);

    const oldIds = oldChildren.map((el) => el.id);
    const newIds = newChildren.map((el) => el.id);

    // 这一层的 diff 必须能在“跳过路径变换”的前提下按顺序执行。
    // 因此顺序固定为：remove（降序）-> move（就地重排）-> insert（升序）-> set_node（基于最终索引）-> recurse

    // 1) 删除：只删除“真的不存在”的元素，避免把 index 位移误判为 move
    const toRemove: Array<{ index: number; element: BoardElement }> = [];
    for (let i = 0; i < oldChildren.length; i++) {
      const el = oldChildren[i];
      if (!newMap.has(el.id)) {
        toRemove.push({ index: i, element: el });
      }
    }

    toRemove.sort((a, b) => b.index - a.index);
    for (const { index, element } of toRemove) {
      ops.push({
        type: "remove_node",
        path: [...basePath, index],
        node: element,
      });
    }

    // 用于模拟本层 children 的结构变化，便于生成可顺序执行的 move/insert
    const currentIds: string[] = oldIds.filter((id) => newMap.has(id));
    const desiredExistingIds: string[] = newIds.filter((id) => oldMap.has(id));

    // 2) 重排：仅对“仍存在”的元素做 move_node，保留对象引用（更接近真实编辑体验）
    for (let i = 0; i < desiredExistingIds.length; i++) {
      if (currentIds[i] === desiredExistingIds[i]) continue;

      const fromIndex = currentIds.indexOf(desiredExistingIds[i], i + 1);
      if (fromIndex === -1) continue;

      ops.push({
        type: "move_node",
        path: [...basePath, fromIndex],
        newPath: [...basePath, i],
      });

      const [moved] = currentIds.splice(fromIndex, 1);
      currentIds.splice(i, 0, moved);
    }

    // 3) 插入：对新增节点执行 insert_node（升序插入可直接使用目标索引）
    const toInsert: Array<{ index: number; element: BoardElement }> = [];
    for (let i = 0; i < newChildren.length; i++) {
      const el = newChildren[i];
      if (!oldMap.has(el.id)) {
        toInsert.push({ index: i, element: el });
      }
    }

    toInsert.sort((a, b) => a.index - b.index);
    for (const { index, element } of toInsert) {
      ops.push({
        type: "insert_node",
        path: [...basePath, index],
        node: element,
      });
      currentIds.splice(index, 0, element.id);
    }

    // 4) set_node + recurse：以最终索引（newChildren 的索引）生成 patch，并递归子节点
    for (let i = 0; i < newChildren.length; i++) {
      const newElement = newChildren[i];
      const oldInfo = oldMap.get(newElement.id);
      if (!oldInfo) {
        // 新插入的节点已经带完整子树，不再递归 diff（避免重复操作）
        continue;
      }

      const oldElement = oldInfo.element;
      const path = [...basePath, i];

      const changes = this.getElementChanges(oldElement, newElement);
      if (Object.keys(changes).length > 0) {
        ops.push({
          type: "set_node",
          path,
          properties: this.getElementPropertiesForChanges(oldElement, changes),
          newProperties: changes,
        });
      }

      const oldChildrenArray = oldElement.children || [];
      const newChildrenArray = newElement.children || [];
      if (oldChildrenArray.length > 0 || newChildrenArray.length > 0) {
        ops.push(...this.diff(oldChildrenArray, newChildrenArray, path));
      }
    }

    // 批量优化：合并连续的同类操作
    return this.optimizeOperations(ops);
  }

  /**
   * diff 单个节点：只对当前节点生成 set_node(patch，不含 children)，children 变化由 diff(children) 生成结构操作。
   * 该方法返回的操作序列适用于按顺序执行且跳过路径变换的场景（例如 BoardOperations.applyDiffOperations）。
   */
  static diffNode(
    oldNode: BoardElement,
    newNode: BoardElement,
    path: number[],
  ): Operation[] {
    const ops: Operation[] = [];

    const changes = this.getElementChanges(oldNode, newNode);
    if (Object.keys(changes).length > 0) {
      ops.push({
        type: "set_node",
        path: [...path],
        properties: this.getElementPropertiesForChanges(oldNode, changes),
        newProperties: changes,
      });
    }

    const oldChildrenArray = oldNode.children || [];
    const newChildrenArray = newNode.children || [];
    if (oldChildrenArray.length > 0 || newChildrenArray.length > 0) {
      ops.push(...this.diff(oldChildrenArray, newChildrenArray, path));
    }

    return this.optimizeOperations(ops);
  }

  /**
   * diff 单个节点（浅层）：仅生成当前节点的 set_node(patch，不含 children)，不递归 children。
   * 适用场景：结构变化已由 move/insert/remove 表达，仅需要根据 layout 结果更新节点自身属性。
   */
  static diffNodePatchOnly(
    oldNode: BoardElement,
    newNode: BoardElement,
    path: number[],
  ): Operation[] {
    const changes = this.getElementChanges(oldNode, newNode);
    if (Object.keys(changes).length === 0) {
      return [];
    }
    return [
      {
        type: "set_node",
        path: [...path],
        properties: this.getElementPropertiesForChanges(oldNode, changes),
        newProperties: changes,
      },
    ];
  }

  /**
   * 将一组操作标记为“已标准化”，用于跳过路径变换与预处理排序。
   * 适用场景：ops 是通过 diff 生成、且依赖“按原始顺序执行”的序列。
   */
  static normalizeOperations(operations: Operation[]): Operation[] {
    operations.forEach((op) => BoardOperations.markAsNormalized(op));
    return operations;
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
  ): SetNodePatch {
    const changes: SetNodePatch = {};

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
   * 只为“会被修改的字段”收集旧值，确保 undo/redo 正确且减少操作体积
   */
  private static getElementPropertiesForChanges(
    element: BoardElement,
    changes: SetNodePatch,
  ): SetNodePatch {
    const properties: SetNodePatch = {};
    for (const key in changes) {
      if (key === "children") continue;
      (properties as any)[key] = (element as any)[key];
    }
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

    // 使用专门的 diff 操作应用方法
    return BoardOperations.applyDiffOperations(children, operations);
  }

  static inverseOperation = (op: Operation): Operation => {
    const wasNormalized = BoardOperations.isNormalizedOperation(op);
    let inverse: Operation;

    switch (op.type) {
      case "insert_node": {
        inverse = { ...op, type: "remove_node" };
        break;
      }

      case "remove_node": {
        inverse = { ...op, type: "insert_node" };
        break;
      }

      case "move_node": {
        // move_node 的 newPath 语义（项目约定）：
        // - path/newPath 基于“移动前”的同一快照
        // - newPath 表达的是“插入位置”（允许等于 children.length），执行时会先 remove(path)，再把 newPath 按 remove 变换后插入
        //
        // 因此 inverse 不能简单 swap：
        // - 需要先算出 forward move 的真实落点 finalPath（即 newPath 在 remove(path) 后的坐标系）
        // - undo 的 newPath 需要基于“move 后的快照”（即在 finalPath 处插入节点后，原 path 在快照中的位置）
        const moveOp = op as Extract<Operation, { type: "move_node" }>;
        const { path, newPath } = moveOp;

        if (SlatePath.equals(path, newPath)) {
          inverse = moveOp;
          break;
        }

        const transformByRemove = (target: number[], removePath: number[]) => {
          const p = [...target];

          if (SlatePath.isAncestor(removePath, p)) {
            return null;
          }

          // 迁移期：若 target 恰好等于 removePath（理论上是 no-op 场景），直接返回原路径，避免得到 null
          if (SlatePath.equals(removePath, p)) {
            return p;
          }

          if (SlatePath.endsBefore(removePath, p)) {
            const depth = removePath.length - 1;
            if (depth >= 0 && depth < p.length) {
              p[depth] -= 1;
            }
          }

          return p;
        };

        const transformByInsert = (target: number[], insertPath: number[]) => {
          const p = [...target];
          if (
            SlatePath.equals(insertPath, p) ||
            SlatePath.endsBefore(insertPath, p) ||
            SlatePath.isAncestor(insertPath, p)
          ) {
            const depth = insertPath.length - 1;
            if (depth >= 0 && depth < p.length) {
              p[depth] += 1;
            }
          }
          return p;
        };

        // forward move 后，节点的真实落点（在 remove(path) 后的坐标系）
        const finalPath = transformByRemove(newPath, path);
        if (!finalPath) {
          // 不可逆/非法 move（例如移动到自身子树内部），保持旧行为：退化为 swap，尽量不让 undo 彻底失效
          inverse = { ...moveOp, path: [...newPath], newPath: [...path] };
          break;
        }

        // undo 的 newPath：把“原始 from(path)”映射到“已经插入了 moved node 的快照”（即 move 后的快照）
        const undoNewPath = transformByInsert(path, finalPath);
        inverse = {
          ...moveOp,
          path: finalPath,
          newPath: undoNewPath,
        };
        break;
      }

      case "set_node": {
        const { properties, newProperties } = op;
        inverse = {
          ...op,
          properties: newProperties,
          newProperties: properties,
        };
        break;
      }

      case "set_selection": {
        const { properties, newProperties } = op;
        inverse = {
          ...op,
          properties: newProperties,
          newProperties: properties,
        };
        break;
      }

      case "set_viewport": {
        const { properties, newProperties } = op;
        if (properties == null) {
          inverse = {
            ...op,
            properties: newProperties,
            newProperties: newProperties,
          };
        } else if (newProperties == null) {
          inverse = {
            ...op,
            properties: properties,
            newProperties: properties,
          };
        } else {
          inverse = {
            ...op,
            properties: newProperties,
            newProperties: properties,
          };
        }
        break;
      }

      case "set_theme": {
        const { properties, newProperties } = op;
        inverse = {
          ...op,
          properties: newProperties,
          newProperties: properties,
        };
        break;
      }

      case "set_moving": {
        const { properties, newProperties } = op;
        inverse = {
          ...op,
          properties: newProperties,
          newProperties: properties,
        };
        break;
      }

      default: {
        throw new Error("unsupport operation");
      }
    }

    if (wasNormalized) {
      BoardOperations.markAsNormalized(inverse);
    }

    return inverse;
  };

  static getParent(board: Board, element: BoardElement): BoardElement | null {
    let parent: BoardElement | null = null;

    this.dfs(
      board,
      (node) => {
        if (
          node.children?.some((child) => child.id === element.id) &&
          !parent
        ) {
          parent = node;
          return true;
        }
      },
      true,
    );

    return parent;
  }

  static getElementById(board: Board, id: string): BoardElement | null {
    let element: BoardElement | null = null;
    this.dfs(
      board,
      (node) => {
        if (node.id === id) {
          element = node;
          return true;
        }
      },
      true,
    );
    return element;
  }
}

export default BoardUtil;
