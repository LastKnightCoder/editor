import { produce } from "immer";
import {
  Board,
  IBoardPlugin,
  MindNodeElement,
  Selection,
  MindDragTarget,
} from "../types";
import {
  isRectIntersect,
  MindUtil,
  selectAreaToRect,
  PointUtil,
  PathUtil,
  BoardUtil,
} from "../utils";
import MindNode from "../components/MindNode";
import { MIND_COLORS } from "../constants";

interface DragState {
  isDragging: boolean;
  draggedNode: MindNodeElement | null;
  sourceRoot: MindNodeElement | null;
  startPoint: { x: number; y: number };
  originalParent: MindNodeElement | null;
  dragOffset: { x: number; y: number };
  previewElement: HTMLElement | null;
  currentTarget?: MindDragTarget | null;
  isDetachedFromSource: boolean; // 是否已从源树分离
  currentAttachedParent: MindNodeElement | null; // 当前连接的父节点
  independentRoot: MindNodeElement | null; // 独立的拖拽树根节点
}

export class MindPlugin implements IBoardPlugin {
  name = "mind-node";

  private dragState: DragState = {
    isDragging: false,
    draggedNode: null,
    sourceRoot: null,
    startPoint: { x: 0, y: 0 },
    originalParent: null,
    dragOffset: { x: 0, y: 0 },
    previewElement: null,
    isDetachedFromSource: false,
    currentAttachedParent: null,
    independentRoot: null,
  };

  private listeners: Set<() => void> = new Set();

  isHit(_board: Board, element: MindNodeElement, x: number, y: number) {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: MindNodeElement, dx: number, dy: number) {
    if (MindUtil.isRoot(element)) {
      return MindUtil.moveAll(element, dx, dy);
    }

    return null;
  }

  isElementSelected(
    board: Board,
    element: MindNodeElement,
    selectArea: Selection["selectArea"] = board.selection.selectArea,
  ) {
    if (!selectArea) return false;
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(element, selectRect);
  }

  private emitChange() {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.dragState;
  }

  getServerSnapshot() {
    return this.dragState;
  }

  onPointerDown(e: PointerEvent, board: Board) {
    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    const hitElements = BoardUtil.getHitElements(
      board,
      startPoint.x,
      startPoint.y,
    );

    if (hitElements.length === 0) return;

    let mindNode: MindNodeElement | null = null;
    const hitElement = hitElements[hitElements.length - 1];
    if (
      hitElement.type === "mind-node" &&
      !MindUtil.isRoot(hitElement as MindNodeElement)
    ) {
      mindNode = hitElement as MindNodeElement;
      board.apply({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: [],
          selectArea: null,
        },
      });
    }

    if (!mindNode) return;

    const sourceRoot = MindUtil.getRoot(board, mindNode);
    if (!sourceRoot) return;

    if (!MindUtil.canMoveNode(sourceRoot, mindNode)) return;

    const originalParent = MindUtil.findParentInTree(sourceRoot, mindNode.id);
    if (!originalParent) return;

    const dragOffset = {
      x: startPoint.x - mindNode.x,
      y: startPoint.y - mindNode.y,
    };

    // 成功开始拖拽准备
    this.dragState = {
      isDragging: false,
      draggedNode: mindNode,
      sourceRoot,
      startPoint,
      originalParent,
      dragOffset,
      previewElement: null,
      currentTarget: null,
      isDetachedFromSource: false,
      currentAttachedParent: null,
      independentRoot: null,
    };

    this.emitChange();
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (!this.dragState.draggedNode) {
      return;
    }

    const { draggedNode, startPoint, sourceRoot, dragOffset } = this.dragState;
    if (!draggedNode || !sourceRoot) {
      this.cleanup();
      return;
    }

    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    if (!currentPoint) {
      this.cleanup();
      return;
    }

    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    const threshold = 5 / board.viewPort.zoom;
    const distance = Math.hypot(dx, dy);

    // 只有移动距离超过阈值才开始拖拽
    if (!this.dragState.isDragging && distance > threshold) {
      this.dragState.isDragging = true;

      this.detachFromSource(board);
    }

    if (!this.dragState.isDragging) {
      return;
    }

    // 计算拖拽节点的新位置（跟随鼠标）
    const newX = currentPoint.x - dragOffset.x;
    const newY = currentPoint.y - dragOffset.y;

    // 更新拖拽节点位置
    const updatedDraggedNode = {
      ...draggedNode,
      x: newX,
      y: newY,
    };

    // 查找最近的目标节点
    const target = MindUtil.findNearestMindNode(
      board,
      currentPoint,
      updatedDraggedNode,
    );

    const previousTarget = this.dragState.currentAttachedParent;
    const currentTargetNode = target?.node || null;

    if (previousTarget?.id !== currentTargetNode?.id) {
      // 目标节点发生变化
      if (previousTarget && !currentTargetNode) {
        // 从已连接状态脱离到独立状态
        this.detachFromTarget(board);
      } else if (!previousTarget && currentTargetNode && target) {
        // 从独立状态连接到目标节点
        this.attachToTarget(board, target);
      } else if (previousTarget && currentTargetNode && target) {
        // 从一个目标切换到另一个目标
        this.detachFromTarget(board);
        this.attachToTarget(board, target);
      }
    }

    // 如果当前处于独立根节点状态，更新根节点位置
    if (
      this.dragState.independentRoot &&
      !this.dragState.currentAttachedParent
    ) {
      this.updateIndependentRootPosition(board, newX, newY);
    }

    // 更新拖拽状态
    this.dragState = {
      ...this.dragState,
      draggedNode: updatedDraggedNode,
      currentTarget: target,
    };

    this.emitChange();
  }

  onGlobalPointerUp(_e: PointerEvent, board: Board) {
    if (!this.dragState.isDragging) {
      this.cleanup();
      return;
    }

    const { draggedNode } = this.dragState;
    if (!draggedNode) {
      this.cleanup();
      return;
    }

    // 为最终的独立根节点设置正确的颜色
    if (
      this.dragState.independentRoot &&
      !this.dragState.currentAttachedParent
    ) {
      const { independentRoot } = this.dragState;

      const finalRoot = produce(independentRoot, (draft) => {
        draft.textColor = MIND_COLORS[0].textColor;
        draft.background = MIND_COLORS[0].background;
      });

      // 更新独立根节点的颜色
      const rootPath = PathUtil.getPathByElement(board, independentRoot);
      if (rootPath) {
        board.apply([
          {
            type: "set_node",
            path: rootPath,
            properties: independentRoot,
            newProperties: finalRoot,
          },
        ]);
      }
    }

    this.cleanup();
  }

  /**
   * 从源树分离拖拽节点，创建独立的拖拽树
   */
  private detachFromSource(board: Board) {
    const { draggedNode, sourceRoot, originalParent } = this.dragState;
    if (!draggedNode || !sourceRoot || !originalParent) return;

    // 从源树移除节点
    let newSourceRoot = produce(sourceRoot, (draft) => {
      const parent = MindUtil.findParentInTree(draft, draggedNode.id);
      if (parent) {
        parent.children = parent.children.filter(
          (child) => child.id !== draggedNode.id,
        );
      }
    });
    newSourceRoot = MindUtil.layout(newSourceRoot);

    // 创建独立的拖拽树
    const independentRoot = MindUtil.createNewRootNode(draggedNode, {
      x: draggedNode.x,
      y: draggedNode.y,
    });

    // 更新白板状态
    const sourcePath = PathUtil.getPathByElement(board, sourceRoot);
    if (sourcePath) {
      board.apply([
        {
          type: "set_node",
          path: sourcePath,
          properties: sourceRoot,
          newProperties: newSourceRoot,
        },
        {
          type: "insert_node",
          path: [board.children.length],
          node: independentRoot,
        },
      ]);
    }

    // 更新拖拽状态
    this.dragState.isDetachedFromSource = true;
    this.dragState.independentRoot = independentRoot;
  }

  /**
   * 将拖拽节点连接到目标父节点
   */
  private attachToTarget(board: Board, target: MindDragTarget) {
    const { draggedNode, independentRoot } = this.dragState;
    if (!draggedNode || !independentRoot) return;

    const independentPath = PathUtil.getPathByElement(board, independentRoot);

    const targetRoot = MindUtil.getRoot(board, target.node);
    if (!targetRoot) return;

    const finalInsertIndex =
      target.insertIndex !== undefined
        ? target.insertIndex
        : target.node.children.length;

    let newTargetRoot = MindUtil.moveNodeToNewParent(
      independentRoot,
      targetRoot,
      draggedNode,
      target.node,
      finalInsertIndex,
    );
    newTargetRoot = MindUtil.layout(newTargetRoot);

    const targetPath = PathUtil.getPathByElement(board, targetRoot);

    if (independentPath && targetPath) {
      board.apply([
        {
          type: "remove_node",
          path: independentPath,
          node: independentRoot,
        },
        {
          type: "set_node",
          path: targetPath,
          properties: targetRoot,
          newProperties: newTargetRoot,
        },
      ]);
    }

    // 更新拖拽状态
    this.dragState.currentAttachedParent = target.node;
    this.dragState.independentRoot = null;
  }

  /**
   * 从目标父节点分离，重新创建独立树
   */
  private detachFromTarget(board: Board) {
    const { draggedNode, currentAttachedParent } = this.dragState;
    if (!draggedNode || !currentAttachedParent) return;

    const targetRoot = MindUtil.getRoot(board, currentAttachedParent);
    if (!targetRoot) return;

    // 从目标树移除节点
    let newTargetRoot = produce(targetRoot, (draft) => {
      const parent = MindUtil.findParentInTree(draft, draggedNode.id);
      if (parent) {
        parent.children = parent.children.filter(
          (child) => child.id !== draggedNode.id,
        );
      }
    });
    newTargetRoot = MindUtil.layout(newTargetRoot);

    // 创建新的独立树
    const independentRoot = MindUtil.createNewRootNode(draggedNode, {
      x: draggedNode.x,
      y: draggedNode.y,
    });

    const targetPath = PathUtil.getPathByElement(board, targetRoot);
    if (targetPath) {
      board.apply([
        {
          type: "set_node",
          path: targetPath,
          properties: targetRoot,
          newProperties: newTargetRoot,
        },
        {
          type: "insert_node",
          path: [board.children.length],
          node: independentRoot,
        },
      ]);
    }

    // 更新拖拽状态
    this.dragState.currentAttachedParent = null;
    this.dragState.independentRoot = independentRoot;
  }

  /**
   * 更新独立根节点的位置
   */
  private updateIndependentRootPosition(
    board: Board,
    newX: number,
    newY: number,
  ) {
    const { independentRoot } = this.dragState;
    if (!independentRoot) return;

    // 计算移动偏移量
    const dx = newX - independentRoot.x;
    const dy = newY - independentRoot.y;

    // 使用 MindUtil.moveAll 移动整个子树
    const updatedRoot = MindUtil.moveAll(independentRoot, dx, dy);

    const rootPath = PathUtil.getPathByElement(board, independentRoot);
    if (rootPath) {
      board.apply([
        {
          type: "set_node",
          path: rootPath,
          properties: independentRoot,
          newProperties: updatedRoot,
        },
      ]);

      // 更新拖拽状态中的独立根节点引用
      this.dragState.independentRoot = updatedRoot;
    }
  }

  private cleanup() {
    this.dragState = {
      isDragging: false,
      draggedNode: null,
      sourceRoot: null,
      startPoint: { x: 0, y: 0 },
      originalParent: null,
      dragOffset: { x: 0, y: 0 },
      previewElement: null,
      currentTarget: null,
      isDetachedFromSource: false,
      currentAttachedParent: null,
      independentRoot: null,
    };
    this.emitChange();
  }

  render(
    _board: Board,
    { element, children }: { element: MindNodeElement; children?: any },
  ) {
    return (
      <g key={element.id}>
        <MindNode element={element} />
        {children}
      </g>
    );
  }
}

export default MindPlugin;
