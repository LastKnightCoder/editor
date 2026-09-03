import { useSyncExternalStore, type ReactNode } from "react";
import { v4 as getUuid } from "uuid";
import {
  Network,
  LayoutGrid,
  Plus,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Unlink,
  FilePlus2,
  Search,
} from "lucide-react";
import {
  Board,
  IBoardPlugin,
  MindNodeElement,
  MindDragTarget,
  Operation,
  Selection,
  MindDragState,
  ContextMenuContext,
  PluginContextMenuItem,
  ECreateBoardElementType,
  IElementCapabilities,
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
  BoardElement,
} from "../types";
import {
  isRectIntersect,
  MindUtil,
  selectAreaToRect,
  PointUtil,
  PathUtil,
  BoardUtil,
} from "../utils";
import { SelectTransforms } from "../transforms";
import MindNode from "../components/MindNode";
import { BOARD_TO_CONTAINER, getMindDragSourceId } from "../constants";
import type { InteractionState } from "../interactions/InteractionState";
import { getThemeById } from "../constants/mind-themes";
import { Descendant } from "slate";
import { createContent } from "@/commands/content";
import useSettingStore from "@/stores/useSettingStore.ts";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

export const EMPTY_MIND_DRAG_STATE: MindDragState = {
  mode: null,
  isDragging: false,
  draggedNode: null,
  sourceRootId: null,
  originalParentId: null,
  startPoint: null,
  dragOffset: { x: 0, y: 0 },
  previewNode: null,
  currentTarget: null,
  connectionLineColor: null,
  pointerId: null,
};

const MindNodeTree = ({
  plugin,
  element,
  children,
}: {
  plugin: MindPlugin;
  element: MindNodeElement;
  children?: ReactNode;
}) => {
  const isDraggedSubtree = useSyncExternalStore(
    (listener) => plugin.subscribe(listener),
    () => plugin.isDraggingNode(element.id),
    () => plugin.isDraggingNode(element.id),
  );

  return (
    <g
      data-mind-node-id={element.id}
      opacity={isDraggedSubtree ? 0.35 : 1}
      style={{ transition: "opacity 120ms ease" }}
    >
      <g id={getMindDragSourceId(element.id)}>
        <MindNode element={element} />
        {children}
      </g>
    </g>
  );
};

export class MindPlugin implements IBoardPlugin {
  name = "mind-node";

  getCapabilities(): IElementCapabilities {
    return {
      snap: {
        behavior: SnapBehavior.RootOnly,
        isRoot: (element: BoardElement) =>
          MindUtil.isRoot(element as MindNodeElement),
        moveAll: (element: BoardElement, dx: number, dy: number) =>
          MindUtil.moveAll(element as MindNodeElement, dx, dy),
      },
      containment: {
        asContainer: ContainmentBehavior.Restricted,
        canBeContained: true,
        canContain: (child: BoardElement) => child.type === "mind-node",
        // mind-node 可以被其他 mind-node 包含（在思维导图树中），也可以被 frame 包含
        canBeContainedBy: (container: BoardElement) =>
          container.type === "mind-node" || container.type === "frame",
      },
      movement: {
        behavior: MovementBehavior.RequiresRelayout,
        // 根节点移动时整棵子树一起平移；子节点移动由拖拽状态机单独处理
        collectMoveSubtree: (element) => {
          if (!MindUtil.isRoot(element as MindNodeElement)) return [element];
          const subtree: BoardElement[] = [element];
          MindUtil.dfs(element as MindNodeElement, {
            before: (node) => {
              if (MindUtil.isRoot(node)) return;
              subtree.push(node);
            },
          });
          return subtree;
        },
        // 图层排序等结构变化移动节点后，重排受影响的导图
        afterMove: (board, element) => {
          const root = MindUtil.getRoot(board, element as MindNodeElement);
          MindUtil.relayoutAffectedRootsAfterMindMove(
            board,
            element.id,
            root?.id ?? null,
          );
        },
      },
      render: {
        childrenOrder: ChildrenRenderOrder.Normal,
        // 折叠方向上的子节点不渲染
        filterVisibleChildren: (element, children) =>
          children.filter((child) => {
            if (child.type !== "mind-node") return true;
            const childMindNode = child as MindNodeElement;
            const isChildLeftDirection = childMindNode.direction === "left";
            const mindNode = element as MindNodeElement;
            return isChildLeftDirection
              ? !mindNode.isLeftFold
              : !mindNode.isRightFold;
          }),
        getColorTheme: () => "orange",
      },
      refLine: {
        participatesInRefLines: true,
        shouldParticipate: (element: BoardElement) =>
          MindUtil.isRoot(element as MindNodeElement),
      },
    };
  }

  private dragState: MindDragState = EMPTY_MIND_DRAG_STATE;

  private dragAnimationFrame: number | null = null;

  private pendingPointerMove: {
    clientX: number;
    clientY: number;
    pointerId: number;
  } | null = null;

  private listeners: Set<() => void> = new Set();

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「创建思维导图」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-mindmap",
        label: "思维导图",
        icon: <Network size={14} />,
        priority: 130,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.MindMap;
        },
      });
    }

    // 右键点击 MindNode
    const mindNode = targetElements.find((el) => el.type === "mind-node") as
      | MindNodeElement
      | undefined;
    if (mindNode) {
      const root = MindUtil.getRoot(context.board, mindNode);
      if (!root) return items;

      const isRootNode = MindUtil.isRoot(mindNode);

      if (isRootNode) {
        // 根节点菜单
        items.push({
          key: "add-mind-node",
          label: "添加节点",
          icon: <Plus size={14} />,
          priority: 100,
          children: [
            {
              key: "add-left-child",
              label: "左子节点",
              icon: <ArrowLeft size={14} />,
              priority: 0,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                // 创建一个新的子节点，设置 direction 为 left
                const newRoot = MindUtil.addChildWithDirection(
                  currentRoot,
                  node,
                  "left",
                );
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(
                  ctx.board,
                  currentRoot,
                );
                if (rootPath) {
                  const ops = BoardUtil.diffNode(
                    currentRoot,
                    newRoot,
                    rootPath,
                  );
                  BoardUtil.normalizeOperations(ops);
                  ctx.board.apply(ops);
                }
              },
            },
            {
              key: "add-right-child",
              label: "右子节点",
              icon: <ArrowRight size={14} />,
              priority: 1,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                // 创建一个新的子节点，设置 direction 为 right
                const newRoot = MindUtil.addChildWithDirection(
                  currentRoot,
                  node,
                  "right",
                );
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(
                  ctx.board,
                  currentRoot,
                );
                if (rootPath) {
                  const ops = BoardUtil.diffNode(
                    currentRoot,
                    newRoot,
                    rootPath,
                  );
                  BoardUtil.normalizeOperations(ops);
                  ctx.board.apply(ops);
                }
              },
            },
          ],
          onSelect: () => {},
        });

        items.push({
          key: "relayout-mindmap",
          label: "重新布局",
          icon: <LayoutGrid size={14} />,
          priority: 101,
          onSelect: (ctx: ContextMenuContext) => {
            const node = ctx.targetElements.find(
              (el) => el.type === "mind-node",
            ) as MindNodeElement;
            if (!node) return;
            const currentRoot = MindUtil.getRoot(ctx.board, node);
            if (!currentRoot) return;

            const newRoot = MindUtil.layout(currentRoot);
            const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
            if (rootPath) {
              const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
              BoardUtil.normalizeOperations(ops);
              ctx.board.apply(ops);
            }
          },
        });

        // 根节点：添加展开/收起左侧和右侧的菜单项（一级菜单）
        const leftChildren = mindNode.children.filter(
          (child) => child.direction === "left",
        );
        const rightChildren = mindNode.children.filter(
          (child) => child.direction === "right",
        );

        if (leftChildren.length > 0) {
          items.push({
            key: "toggle-left-fold",
            label: mindNode.isLeftFold ? "展开左侧" : "收起左侧",
            icon: mindNode.isLeftFold ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            ),
            priority: 102,
            onSelect: (ctx: ContextMenuContext) => {
              const node = ctx.targetElements.find(
                (el) => el.type === "mind-node",
              ) as MindNodeElement;
              if (!node) return;
              const currentRoot = MindUtil.getRoot(ctx.board, node);
              if (!currentRoot) return;

              const newRoot = MindUtil.toggleFold(currentRoot, node, "left");
              const rootPath = PathUtil.getPathByElement(
                ctx.board,
                currentRoot,
              );
              if (rootPath) {
                const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                BoardUtil.normalizeOperations(ops);
                ctx.board.apply(ops);
              }
            },
          });
        }

        if (rightChildren.length > 0) {
          items.push({
            key: "toggle-right-fold",
            label: mindNode.isRightFold ? "展开右侧" : "收起右侧",
            icon: mindNode.isRightFold ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            ),
            priority: 103,
            onSelect: (ctx: ContextMenuContext) => {
              const node = ctx.targetElements.find(
                (el) => el.type === "mind-node",
              ) as MindNodeElement;
              if (!node) return;
              const currentRoot = MindUtil.getRoot(ctx.board, node);
              if (!currentRoot) return;

              const newRoot = MindUtil.toggleFold(currentRoot, node, "right");
              const rootPath = PathUtil.getPathByElement(
                ctx.board,
                currentRoot,
              );
              if (rootPath) {
                const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                BoardUtil.normalizeOperations(ops);
                ctx.board.apply(ops);
              }
            },
          });
        }
      } else {
        // 非根节点菜单
        items.push({
          key: "add-mind-node",
          label: "添加节点",
          icon: <Plus size={14} />,
          priority: 100,
          children: [
            {
              key: "add-sibling-before",
              label: "上兄弟节点",
              icon: <ArrowUp size={14} />,
              priority: 0,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                const newRoot = MindUtil.addSiblingBefore(currentRoot, node);
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(
                  ctx.board,
                  currentRoot,
                );
                if (rootPath) {
                  const ops = BoardUtil.diffNode(
                    currentRoot,
                    newRoot,
                    rootPath,
                  );
                  BoardUtil.normalizeOperations(ops);
                  ctx.board.apply(ops);
                }
              },
            },
            {
              key: "add-sibling-after",
              label: "下兄弟节点",
              icon: <ArrowDown size={14} />,
              priority: 1,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                const newRoot = MindUtil.addSibling(currentRoot, node);
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(
                  ctx.board,
                  currentRoot,
                );
                if (rootPath) {
                  const ops = BoardUtil.diffNode(
                    currentRoot,
                    newRoot,
                    rootPath,
                  );
                  BoardUtil.normalizeOperations(ops);
                  ctx.board.apply(ops);
                }
              },
            },
            {
              key: "add-child-node",
              label: "子节点",
              icon: <CornerDownRight size={14} />,
              priority: 2,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                const newRoot = MindUtil.addChild(currentRoot, node);
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(
                  ctx.board,
                  currentRoot,
                );
                if (rootPath) {
                  const ops = BoardUtil.diffNode(
                    currentRoot,
                    newRoot,
                    rootPath,
                  );
                  BoardUtil.normalizeOperations(ops);
                  ctx.board.apply(ops);
                }
              },
            },
          ],
          onSelect: () => {},
        });

        // 非根节点：添加展开/收起节点的菜单项
        if (mindNode.children && mindNode.children.length > 0) {
          // 检查子节点的方向，确定使用哪个折叠状态
          const hasLeftChildren = mindNode.children.some(
            (child) => child.direction === "left",
          );
          const hasRightChildren = mindNode.children.some(
            (child) => child.direction === "right",
          );

          // 确定折叠状态
          let isFolded = false;
          if (hasLeftChildren) {
            isFolded = mindNode.isLeftFold || false;
          } else if (hasRightChildren) {
            isFolded = mindNode.isRightFold || false;
          }

          items.push({
            key: "toggle-fold",
            label: isFolded ? "展开节点" : "收起节点",
            icon: isFolded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            ),
            priority: 101,
            onSelect: (ctx: ContextMenuContext) => {
              const node = ctx.targetElements.find(
                (el) => el.type === "mind-node",
              ) as MindNodeElement;
              if (!node) return;
              const currentRoot = MindUtil.getRoot(ctx.board, node);
              if (!currentRoot) return;

              // 检查子节点方向并切换折叠状态
              const hasLeft = node.children.some(
                (child) => child.direction === "left",
              );
              const dir: "left" | "right" = hasLeft ? "left" : "right";

              const newRoot = MindUtil.toggleFold(currentRoot, node, dir);
              const rootPath = PathUtil.getPathByElement(
                ctx.board,
                currentRoot,
              );
              if (rootPath) {
                const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                BoardUtil.normalizeOperations(ops);
                ctx.board.apply(ops);
              }
            },
          });
        }
      }

      // 笔记相关菜单项（根节点与非根节点通用）
      if (mindNode.contentId) {
        items.push({
          key: "mind-open-note",
          label: "打开笔记",
          icon: <StickyNote size={14} />,
          priority: 150,
          onSelect: (ctx: ContextMenuContext) => {
            const node = ctx.targetElements.find(
              (el) => el.type === "mind-node",
            ) as MindNodeElement;
            if (!node?.contentId) return;
            ctx.board.emit("open-note", node.contentId, node.contentTitle);
          },
        });

        items.push({
          key: "mind-unlink-note",
          label: "取消关联笔记",
          icon: <Unlink size={14} />,
          priority: 151,
          danger: true,
          onSelect: (ctx: ContextMenuContext) => {
            const node = ctx.targetElements.find(
              (el) => el.type === "mind-node",
            ) as MindNodeElement;
            if (!node?.contentId) return;
            ctx.board.emit("mind:confirm-unlink-note", node.id);
          },
        });
      } else {
        items.push({
          key: "mind-link-note",
          label: "关联笔记",
          icon: <FilePlus2 size={14} />,
          priority: 150,
          children: [
            {
              key: "mind-create-note",
              label: "新建笔记",
              icon: <FilePlus2 size={14} />,
              priority: 0,
              onSelect: async (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                const contentId = await createContent(DEFAULT_CONTENT, 0);
                if (!contentId) return;
                const nodePath = PathUtil.getPathByElement(ctx.board, node);
                if (!nodePath) return;
                ctx.board.apply({
                  type: "set_node",
                  path: nodePath,
                  properties: {
                    contentId: node.contentId,
                    contentTitle: node.contentTitle,
                  },
                  newProperties: {
                    contentId,
                    contentTitle: "",
                  },
                });
                ctx.board.emit("open-note", contentId, "");
              },
            },
            {
              key: "mind-select-note",
              label: "选择笔记",
              icon: <Search size={14} />,
              priority: 1,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  (el) => el.type === "mind-node",
                ) as MindNodeElement;
                if (!node) return;
                ctx.board.emit("mind:select-note", node.id);
              },
            },
          ],
          onSelect: () => {},
        });
      }
    }

    return items;
  }

  isHit(_board: Board, element: MindNodeElement, x: number, y: number) {
    // 若节点在折叠状态（被父级或祖先按其方向折叠而隐藏），直接不可命中
    const root = MindUtil.getRoot(_board, element);
    if (root) {
      let isVisible = false;
      MindUtil.dfs(
        root,
        {
          before: (current) => {
            if (current.id === element.id) {
              isVisible = true;
            }
          },
        },
        null,
        0,
        true,
      );
      if (!isVisible) return false;
    }

    const { x: left, y: top, width, height } = element;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: MindNodeElement, dx: number, dy: number) {
    if (MindUtil.isRoot(element)) {
      return MindUtil.moveAll(element, dx, dy);
    }

    return null;
  }

  getBounds(_board: Board, element: MindNodeElement) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    MindUtil.dfs(
      element,
      {
        before: (node) => {
          minX = Math.min(minX, node.x);
          minY = Math.min(minY, node.y);
          maxX = Math.max(maxX, node.x + node.width);
          maxY = Math.max(maxY, node.y + node.height);
        },
      },
      null,
      0,
      true,
    );

    if (
      minX === Infinity ||
      minY === Infinity ||
      maxX === -Infinity ||
      maxY === -Infinity
    ) {
      return {
        minX: element.x,
        minY: element.y,
        maxX: element.x + element.width,
        maxY: element.y + element.height,
      };
    }

    return { minX, minY, maxX, maxY };
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
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.dragState;
  }

  getServerSnapshot() {
    return this.dragState;
  }

  isDraggingNode(nodeId: string) {
    return (
      this.dragState.mode === "preview" &&
      this.dragState.isDragging &&
      this.dragState.draggedNode?.id === nodeId
    );
  }

  private createMindRoot(x: number, y: number): MindNodeElement {
    const fontSize = useSettingStore.getState().setting.fontSetting.fontSize;
    const lineHeight = fontSize * 1.57;
    const totalHeight = lineHeight + 16 * 2;

    return {
      id: getUuid(),
      type: "mind-node",
      x,
      y,
      width: 24,
      height: totalHeight,
      actualHeight: totalHeight,
      level: 1,
      leftChildrenHeight: 0,
      rightChildrenHeight: 0,
      childrenHeight: 0,
      direction: "right",
      text: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
              bold: true,
            },
          ],
        },
      ],
      children: [],
      defaultFocus: true,
      isLeftFold: false,
      isRightFold: false,
      themeId: MindUtil.getDefaultThemeId(),
    };
  }

  onClick(e: MouseEvent, board: Board) {
    if (board.currentCreateType !== ECreateBoardElementType.MindMap) {
      return;
    }

    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    if (!currentPoint) return;

    const mindRoot = this.createMindRoot(currentPoint.x, currentPoint.y);

    board.apply([
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [],
        },
      },
      {
        type: "insert_node",
        path: [board.children.length],
        node: mindRoot,
      },
    ]);

    board.currentCreateType = ECreateBoardElementType.None;
  }

  /**
   * 思维导图节点拖拽的手势声明：pointerdown 命中 mind-node 且节点可移动时，
   * 初始化拖拽状态机并返回 MindDragInteraction 交由交互内核接管路由。
   * （原 onPointerDown 的 return false 抢占已由内核仲裁取代）
   */
  claimPointerGesture(
    board: Board,
    e: PointerEvent,
    hitElement: BoardElement,
  ): MindDragInteraction | null {
    if (
      e.button !== 0 ||
      board.readonly ||
      board.presentationManager.isPresentationMode
    ) {
      return null;
    }

    if (hitElement.type !== "mind-node") return null;
    const mindNode = hitElement as MindNodeElement;

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return null;

    const sourceRoot = MindUtil.getRoot(board, mindNode);
    if (!sourceRoot) return null;

    if (!MindUtil.canMoveNode(sourceRoot, mindNode)) return null;

    const originalParent = MindUtil.findParentInTree(sourceRoot, mindNode.id);
    if (!MindUtil.isRoot(mindNode) && !originalParent) return null;

    const dragOffset = {
      x: startPoint.x - mindNode.x,
      y: startPoint.y - mindNode.y,
    };

    this.cancelScheduledPointerMove();
    // 注意：此处不清空选区——未越过拖拽阈值的点击要回落为点选语义，
    // 清空选区的时机后移到拖拽真正开始时（updateDragPreview）。

    e.preventDefault();
    window.getSelection?.()?.removeAllRanges();

    this.setDragState({
      mode: MindUtil.isRoot(mindNode) ? "root-translate" : "preview",
      isDragging: false,
      draggedNode: mindNode,
      sourceRootId: sourceRoot.id,
      originalParentId: originalParent?.id ?? null,
      startPoint,
      dragOffset,
      previewNode: null,
      currentTarget: null,
      connectionLineColor: null,
      pointerId: e.pointerId,
    });

    return new MindDragInteraction(this);
  }

  /** 当前拖拽是否由该指针发起（由 MindDragInteraction 转发前校验） */
  isDragPointer(pointerId: number): boolean {
    return (
      Boolean(this.dragState.draggedNode) &&
      this.dragState.pointerId === pointerId
    );
  }

  /** 拖拽移动调度（rAF 合帧，原 onGlobalPointerMove 主体） */
  scheduleDragPreview(e: PointerEvent, board: Board) {
    this.pendingPointerMove = {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerId: e.pointerId,
    };

    if (this.dragAnimationFrame === null) {
      const requestFrame =
        globalThis.requestAnimationFrame ??
        ((callback: FrameRequestCallback) =>
          globalThis.setTimeout(() => callback(performance.now()), 16));
      this.dragAnimationFrame = requestFrame(() => {
        this.dragAnimationFrame = null;
        const pending = this.pendingPointerMove;
        this.pendingPointerMove = null;
        if (!pending || pending.pointerId !== this.dragState.pointerId) return;
        this.updateDragPreview(board, pending.clientX, pending.clientY);
      });
    }
  }

  /** 拖拽收尾：提交落点或越界取消；未构成拖拽的点击回落为点选（原 onGlobalPointerUp 主体） */
  finishDrag(e: PointerEvent, board: Board) {
    this.cancelScheduledPointerMove();
    if (!this.isPointerInsideBoard(board, e.clientX, e.clientY)) {
      this.cancelDrag(board);
      return;
    }

    this.updateDragPreview(board, e.clientX, e.clientY);
    if (this.dragState.isDragging) {
      this.commitDrop(board);
    }
    if (this.dragState.mode === "root-translate" && this.dragState.isDragging) {
      board.emit("element:move-end");
    } else if (!this.dragState.isDragging) {
      this.selectClickedNode(e, board);
    }

    this.cleanup();
  }

  /**
   * 未越过拖拽阈值的点击：回落为点选语义，与其他元素的点击选中保持一致
   * （ctrl/cmd 点击在多选中切换该节点）。
   */
  private selectClickedNode(e: PointerEvent, board: Board) {
    const draggedNode = this.dragState.draggedNode;
    if (!draggedNode) return;
    const latestNode = BoardUtil.getElementById(board, draggedNode.id);
    if (!latestNode || latestNode.type !== "mind-node") return;

    const isMultiSelect = e.ctrlKey || e.metaKey;
    const current = board.selection.selectedElements;
    let selectedElements: BoardElement[];
    if (isMultiSelect) {
      const existingIndex = current.findIndex((el) => el.id === latestNode.id);
      selectedElements =
        existingIndex >= 0
          ? current.filter((el) => el.id !== latestNode.id)
          : [...current, latestNode];
    } else {
      selectedElements = [latestNode];
    }

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements,
    });
  }

  updateDragPreview(board: Board, clientX: number, clientY: number) {
    const { draggedNode, startPoint, dragOffset, currentTarget } =
      this.dragState;
    if (!draggedNode || !startPoint) return;

    const currentPoint = PointUtil.screenToViewPort(board, clientX, clientY);
    if (!currentPoint) return;

    const distanceFromStart = Math.hypot(
      currentPoint.x - startPoint.x,
      currentPoint.y - startPoint.y,
    );
    const isDragging =
      this.dragState.isDragging ||
      distanceFromStart > 5 / Math.max(board.viewPort.zoom, 0.01);
    if (!isDragging) return;

    // 拖拽首次越过阈值时隐藏选中态（点击场景保留选区供点选回落）
    if (
      !this.dragState.isDragging &&
      (board.selection.selectedElements.length > 0 ||
        board.selection.selectArea)
    ) {
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectedElements: [],
            selectArea: null,
          },
        },
        false,
      );
    }

    const nextX = currentPoint.x - dragOffset.x;
    const nextY = currentPoint.y - dragOffset.y;
    let previewNode: MindNodeElement;
    let target: MindDragTarget | null;

    if (this.dragState.mode === "root-translate") {
      const latestRoot = BoardUtil.getElementById(
        board,
        draggedNode.id,
      ) as MindNodeElement | null;
      const rootPath = latestRoot
        ? PathUtil.getPathByElement(board, latestRoot)
        : null;
      if (!latestRoot || latestRoot.type !== "mind-node" || !rootPath) return;

      target = MindUtil.findNearestMindNode(
        board,
        { ...latestRoot, x: nextX, y: nextY },
        currentTarget,
      );

      if (currentTarget?.direction !== target?.direction) {
        const desiredRoot = MindUtil.createRootDragLayout(
          draggedNode,
          { x: nextX, y: nextY },
          target?.direction ?? null,
        );
        const layoutOperations = BoardUtil.diffNode(
          latestRoot,
          desiredRoot,
          rootPath,
        );
        if (layoutOperations.length > 0) {
          BoardUtil.normalizeOperations(layoutOperations);
          board.apply(layoutOperations, false);
        }
      } else {
        const translateOperations = BoardUtil.buildTranslateSubtreeOps(
          latestRoot,
          rootPath,
          nextX - latestRoot.x,
          nextY - latestRoot.y,
        );
        if (translateOperations.length > 0) {
          board.apply(translateOperations, false);
        }
      }

      const movedRoot = BoardUtil.getElementById(
        board,
        draggedNode.id,
      ) as MindNodeElement | null;
      if (!movedRoot || movedRoot.type !== "mind-node") return;
      previewNode = movedRoot;
      board.emit("element:move", [movedRoot]);
    } else {
      previewNode = {
        ...draggedNode,
        x: nextX,
        y: nextY,
      };
      target = MindUtil.findNearestMindNode(board, previewNode, currentTarget);
    }
    const connectionLineColor = target
      ? this.getConnectionLineColor(board, target.node)
      : null;

    this.setDragState({
      ...this.dragState,
      isDragging: true,
      previewNode,
      currentTarget: target,
      connectionLineColor,
    });
  }

  private getConnectionLineColor(board: Board, targetNode: MindNodeElement) {
    const root = MindUtil.getRoot(board, targetNode);
    const theme = getThemeById(root?.themeId || MindUtil.getDefaultThemeId());
    const colorIndex = Math.max(0, targetNode.level - 1) % theme.palette.length;
    return theme.palette[colorIndex]?.background || theme.root.background;
  }

  commitDrop(board: Board) {
    const { draggedNode, sourceRootId, previewNode, currentTarget } =
      this.dragState;
    if (!draggedNode || !sourceRootId || !previewNode) return;

    const sourceRoot = BoardUtil.getElementById(
      board,
      sourceRootId,
    ) as MindNodeElement | null;
    if (!sourceRoot || sourceRoot.type !== "mind-node") return;

    const latestDraggedNode = MindUtil.findNodeInTree(
      sourceRoot,
      draggedNode.id,
    );
    if (
      !latestDraggedNode ||
      !MindUtil.canMoveNode(sourceRoot, latestDraggedNode)
    ) {
      return;
    }

    const sourcePath = PathUtil.getPathByElement(board, sourceRoot);
    if (!sourcePath) return;

    const operations: Operation[] = [];
    if (currentTarget) {
      const targetNode = BoardUtil.getElementById(
        board,
        currentTarget.node.id,
      ) as MindNodeElement | null;
      if (
        !targetNode ||
        targetNode.type !== "mind-node" ||
        !MindUtil.isValidDrop(latestDraggedNode, targetNode) ||
        (!MindUtil.isRoot(targetNode) &&
          targetNode.direction !== currentTarget.direction)
      ) {
        return;
      }

      const targetRoot = MindUtil.getRoot(board, targetNode);
      const targetPath = targetRoot
        ? PathUtil.getPathByElement(board, targetRoot)
        : null;
      if (!targetRoot || !targetPath) return;

      const placement = MindUtil.calculateInsertPosition(
        targetNode,
        {
          x: previewNode.x + previewNode.width / 2,
          y: previewNode.y + previewNode.height / 2,
        },
        currentTarget.direction,
        latestDraggedNode.id,
      );

      if (targetRoot.id === sourceRoot.id) {
        const updatedRoot = MindUtil.layout(
          MindUtil.moveNodeToNewParent(
            sourceRoot,
            sourceRoot,
            latestDraggedNode,
            targetNode,
            placement.insertIndex,
            placement.direction,
          ),
        );
        operations.push(
          ...BoardUtil.diffNode(sourceRoot, updatedRoot, sourcePath),
        );
      } else {
        const updatedTargetRoot = MindUtil.layout(
          MindUtil.moveNodeToNewParent(
            sourceRoot,
            targetRoot,
            latestDraggedNode,
            targetNode,
            placement.insertIndex,
            placement.direction,
          ),
        );

        if (MindUtil.isRoot(latestDraggedNode)) {
          const removeSourceOperation: Operation = {
            type: "remove_node",
            path: sourcePath,
            node: draggedNode,
          };
          const adjustedTargetPath = PathUtil.transformPath(
            targetPath,
            removeSourceOperation,
          );
          if (!adjustedTargetPath) return;

          operations.push(
            removeSourceOperation,
            ...BoardUtil.diffNode(
              targetRoot,
              updatedTargetRoot,
              adjustedTargetPath,
            ),
          );
        } else {
          const updatedSourceRoot = MindUtil.deleteNode(
            sourceRoot,
            latestDraggedNode,
          );
          operations.push(
            ...BoardUtil.diffNode(sourceRoot, updatedSourceRoot, sourcePath),
            ...BoardUtil.diffNode(targetRoot, updatedTargetRoot, targetPath),
          );
        }
      }
    } else {
      if (MindUtil.isRoot(latestDraggedNode)) {
        operations.push(
          ...BoardUtil.buildTranslateSubtreeOps(
            draggedNode,
            sourcePath,
            previewNode.x - draggedNode.x,
            previewNode.y - draggedNode.y,
          ),
        );
      } else {
        const updatedSourceRoot = MindUtil.deleteNode(
          sourceRoot,
          latestDraggedNode,
        );
        const independentRoot = MindUtil.createNewRootNode(latestDraggedNode, {
          x: previewNode.x,
          y: previewNode.y,
        });
        operations.push(
          ...BoardUtil.diffNode(sourceRoot, updatedSourceRoot, sourcePath),
          {
            type: "insert_node",
            path: [board.children.length],
            node: independentRoot,
          },
        );
      }
    }

    if (operations.length === 0) return;
    BoardUtil.normalizeOperations(operations);
    board.apply(operations);
  }

  isPointerInsideBoard(board: Board, clientX: number, clientY: number) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  setDragState(nextState: MindDragState) {
    this.dragState = nextState;
    this.emitChange();
  }

  cancelScheduledPointerMove() {
    if (this.dragAnimationFrame !== null) {
      const cancelFrame =
        globalThis.cancelAnimationFrame ?? globalThis.clearTimeout;
      cancelFrame(this.dragAnimationFrame);
      this.dragAnimationFrame = null;
    }
    this.pendingPointerMove = null;
  }

  cancelDrag(board: Board) {
    const { mode, isDragging, draggedNode } = this.dragState;
    if (mode === "root-translate" && isDragging && draggedNode) {
      const latestRoot = BoardUtil.getElementById(
        board,
        draggedNode.id,
      ) as MindNodeElement | null;
      const rootPath = latestRoot
        ? PathUtil.getPathByElement(board, latestRoot)
        : null;
      if (latestRoot?.type === "mind-node" && rootPath) {
        const restoreOperations = BoardUtil.diffNode(
          latestRoot,
          draggedNode,
          rootPath,
        );
        if (restoreOperations.length > 0) {
          BoardUtil.normalizeOperations(restoreOperations);
          board.apply(restoreOperations, false);
        }
        board.emit("element:move-end");
      }
    }

    this.cleanup();
  }

  private cleanup() {
    this.cancelScheduledPointerMove();
    this.setDragState(EMPTY_MIND_DRAG_STATE);
  }

  render(
    _board: Board,
    { element, children }: { element: MindNodeElement; children?: ReactNode },
  ) {
    return (
      <MindNodeTree
        key={element.id}
        plugin={this}
        element={element}
        children={children}
      />
    );
  }
}

export default MindPlugin;

/**
 * 思维导图拖拽的交互内核适配：由 MindPlugin.claimPointerGesture 创建，
 * 将内核路由的指针/键盘事件转发给插件的拖拽状态机并消费。
 * 取代旧机制中插件 onGlobalPointerMove 等通过 return false 的抢占，
 * 拖拽状态机（含 MindDragOverlay 的订阅）仍留在插件内。
 */
class MindDragInteraction implements InteractionState {
  readonly name = "mind-drag";
  isFinished = false;

  constructor(private plugin: MindPlugin) {}

  onGlobalPointerMove(e: PointerEvent, board: Board): boolean {
    if (!this.plugin.isDragPointer(e.pointerId)) return false;
    this.plugin.scheduleDragPreview(e, board);
    return true;
  }

  onGlobalPointerUp(e: PointerEvent, board: Board): boolean {
    if (!this.plugin.isDragPointer(e.pointerId)) return false;
    this.plugin.finishDrag(e, board);
    this.isFinished = true;
    return true;
  }

  onGlobalPointerCancel(e: PointerEvent, board: Board): boolean {
    if (!this.plugin.isDragPointer(e.pointerId)) return false;
    this.plugin.cancelDrag(board);
    this.isFinished = true;
    return true;
  }

  onKeyDown(e: KeyboardEvent, board: Board): boolean {
    if (e.key !== "Escape") return false;
    this.plugin.cancelDrag(board);
    this.isFinished = true;
    return true;
  }
}
