import { embeddedTextOptions, type TextExtensionOptions } from "../extensions/text";
import { useSyncExternalStore, type ReactNode } from "react";
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
  ListTree,
  ClipboardPaste,
  Braces,
  BoxSelect,
  Spline,
  Type,
  Trash2,
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
  IElementCapabilities,
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
  BoardElement,
  CustomOffset,
} from "../types";
import {
  isRectIntersect,
  MindUtil,
  selectAreaToRect,
  PointUtil,
  PathUtil,
  BoardUtil,
} from "../utils";
import { getMindLayout } from "../utils/mind-layout";
import BoardOperations from "../utils/BoardOperations";
import type { MoveNodeOperation } from "../types/operation";
import {
  cancelMindRelation,
  createMindRelation,
  relationStoreOf,
  startMindRelation,
  visibleRelationEnd,
  withMindRelationRemovals,
} from "../utils/mindRelation";
import { EDIT_BOUNDARY_EVENT } from "../components/MindNode/MindRanges";
import { ARROW_CONNECT_ID } from "../constants/arrow";
import { detectHotkeyPlatform, formatHotkey } from "../utils/hotkeyFormat";
import { isMarkdownLikeText } from "@tau/markdown";
import { toast } from "@tau/ui";
import { WhiteboardValidationError } from "../extensions/validation";
import {
  markdownToOutline,
  outlineDepth,
  MIND_OUTLINE_LIMIT,
  MindOutlineDepthError,
  type MindOutline,
} from "../utils/mind-markdown";
import {
  asBranch,
  isWhiteboardPayload,
  mindClipboardText,
  mindRootFromOutline,
  mindSubtreesFromPayload,
} from "../utils/mind-clipboard";
import { WHITEBOARD_LIMITS } from "@tau/collaboration";

/** 像列表或多行的文字才拆成大纲；超出上限时提示只转了前面一部分 */
const outlineFromText = (
  text: string,
  maxDepth: number = WHITEBOARD_LIMITS.payloadDepth
): MindOutline[] | null => {
  if (!isMarkdownLikeText(text) && !/\n/.test(text.trim())) return null;
  const { outline, truncated } = markdownToOutline(text, MIND_OUTLINE_LIMIT, maxDepth);
  if (!outline.length) return null;
  if (truncated) toast.info(`内容较多，只转换了前 ${MIND_OUTLINE_LIMIT} 行`);
  return outline;
};
import { SelectTransforms } from "../transforms";
import MindNode from "../components/MindNode";
import { BOARD_TO_CONTAINER, getMindDragSourceId } from "../constants";
import { MIND_TOOL_ID } from "../constants/tools";
import type { InteractionState } from "../interactions/InteractionState";
import MindThemeUtil from "../utils/MindThemeUtil";
import { useThemeStore } from "@tau/themes/react";
import { Descendant } from "slate";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const EMPTY_MIND_DRAG_STATE: MindDragState = {
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
    listener => plugin.subscribe(listener),
    () => plugin.isDraggingNode(element.id),
    () => plugin.isDraggingNode(element.id)
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
  readonly claimPointerButton = 0;

  constructor(private readonly text: TextExtensionOptions = embeddedTextOptions) {}

  getCapabilities(): IElementCapabilities {
    return {
      snap: {
        behavior: SnapBehavior.RootOnly,
        isRoot: (element: BoardElement) => MindUtil.isRoot(element as MindNodeElement),
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
        collectMoveSubtree: element => {
          if (!MindUtil.isRoot(element as MindNodeElement)) return [element];
          const subtree: BoardElement[] = [element];
          MindUtil.dfs(element as MindNodeElement, {
            before: node => {
              if (MindUtil.isRoot(node)) return;
              subtree.push(node);
            },
          });
          return subtree;
        },
        // 图层排序等结构变化移动节点后，重排受影响的导图
        afterMove: (board, element) => {
          const root = MindUtil.getRoot(board, element as MindNodeElement);
          MindUtil.relayoutAffectedRootsAfterMindMove(board, element.id, root?.id ?? null);
        },
      },
      render: {
        childrenOrder: ChildrenRenderOrder.Normal,
        // 折叠方向上的子节点不渲染
        filterVisibleChildren: (element, children) =>
          children.filter(child => {
            if (child.type !== "mind-node") return true;
            const childMindNode = child as MindNodeElement;
            const isChildLeftDirection = childMindNode.direction === "left";
            const mindNode = element as MindNodeElement;
            return isChildLeftDirection ? !mindNode.isLeftFold : !mindNode.isRightFold;
          }),
        getColorTheme: () => "orange",
      },
      refLine: {
        participatesInRefLines: true,
        shouldParticipate: (element: BoardElement) => MindUtil.isRoot(element as MindNodeElement),
      },
      clipboard: {
        copyText: elements => mindClipboardText(elements),
        pasteInto: (board, target, clipboard) =>
          this.pasteInto(board, target as MindNodeElement, clipboard),
      },
    };
  }

  /** 剪贴板里是导图子树就挂成子节点；否则把纯文本按列表拆成子节点 */
  private pasteInto(
    board: Board,
    target: MindNodeElement,
    { payloads, text }: { payloads: unknown[]; text?: string }
  ) {
    for (const payload of payloads) {
      const subtrees = mindSubtreesFromPayload(payload);
      if (subtrees) return this.attachUnder(board, target, subtrees);
    }
    // 其他白板内容（形状、图片……）照常粘到画布上
    if (payloads.some(isWhiteboardPayload)) return false;
    if (!text?.trim()) return false;
    const path = PathUtil.getPathByElement(board, target);
    if (!path) return false;
    const maxDepth = WHITEBOARD_LIMITS.payloadDepth - path.length;
    try {
      const outline =
        outlineFromText(text, maxDepth) ??
        markdownToOutline(text.trim(), MIND_OUTLINE_LIMIT, maxDepth).outline;
      if (!outline.length) return false;
      return this.attachUnder(
        board,
        target,
        MindUtil.nodesFromOutline(outline, board.getFontSize(), maxDepth)
      );
    } catch (error) {
      if (!(error instanceof MindOutlineDepthError)) throw error;
      toast.error(error.message);
      return true;
    }
  }

  /** 把若干子树挂到 target 下，一次提交，选中挂上去的第一个 */
  private attachUnder(board: Board, target: MindNodeElement, subtrees: MindNodeElement[]) {
    const root = MindUtil.getRoot(board, target);
    const rootPath = root && PathUtil.getPathByElement(board, root);
    if (!root || !rootPath) return false;
    const result = MindUtil.attachSubtrees(root, target.id, subtrees.map(asBranch));
    if (!result) return false;
    const first = MindUtil.findNodeInTree(result.root, result.attached[0].id);
    const ops: Operation[] = [
      ...BoardUtil.diffNode(root, result.root, rootPath),
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectArea: null, selectedElements: first ? [first] : [] },
      },
    ];
    BoardUtil.normalizeOperations(ops);
    board.apply(ops);
    // 本机模式下笔记按引用计数，粘贴出的每个关联多引用一次
    if (!board.document)
      result.attached.forEach(node =>
        MindUtil.dfs(node, {
          before: current => {
            if (current.contentId) void this.text.retain?.(current.contentId);
          },
        })
      );
    return true;
  }

  private async pasteAsMindMap(ctx: ContextMenuContext) {
    const { board } = ctx;
    let text: string | null = null;
    try {
      text = (await navigator.clipboard?.readText?.()) ?? null;
    } catch {
      text = null;
    }
    try {
      const outline = text ? outlineFromText(text) : null;
      if (!outline || outlineDepth(outline) < 2) {
        toast.info("剪贴板里没有多级列表");
        return;
      }
      const root = mindRootFromOutline(outline, ctx.viewPortPoint, board.getFontSize());
      board.apply([
        { type: "insert_node", path: [board.children.length], node: root },
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: { selectArea: null, selectedElements: [root] },
        },
      ]);
    } catch (error) {
      if (error instanceof WhiteboardValidationError || error instanceof MindOutlineDepthError) {
        toast.error(
          error instanceof MindOutlineDepthError ? error.message : "粘贴失败，原内容未改变"
        );
        return;
      }
      throw error;
    }
  }

  private applyRootChange(
    ctx: ContextMenuContext,
    change: (root: MindNodeElement, node: MindNodeElement) => MindNodeElement | null | undefined
  ) {
    const node = ctx.targetElements.find(el => el.type === "mind-node") as MindNodeElement;
    if (!node) return;
    const currentRoot = MindUtil.getRoot(ctx.board, node);
    if (!currentRoot) return;
    const newRoot = change(currentRoot, node);
    const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
    if (!newRoot || !rootPath) return;
    const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
    BoardUtil.normalizeOperations(ops);
    ctx.board.apply(ops);
  }

  private addChildFromMenu(ctx: ContextMenuContext) {
    this.applyRootChange(ctx, (root, node) =>
      MindUtil.addChild(root, node, undefined, undefined, ctx.board.getFontSize())
    );
  }

  private toggleFoldFromMenu(ctx: ContextMenuContext, side: "left" | "right") {
    this.applyRootChange(ctx, (root, node) => MindUtil.toggleFold(root, node, side));
  }

  private shortcut(key: string) {
    return formatHotkey(key, detectHotkeyPlatform());
  }

  /** 概要 / 外框 / 联系线：选中的相邻同级节点可加概要与外框 */
  private rangeMenu(context: ContextMenuContext, root: MindNodeElement): PluginContextMenuItem[] {
    if (context.board.readonly) return [];
    const ids = context.targetElements.filter(el => el.type === "mind-node").map(el => el.id);
    const adjacent = MindUtil.adjacentSiblings(root, ids) !== null;
    const hint = adjacent ? undefined : "选中相邻的同级节点";
    const commit = (next: MindNodeElement | null | undefined, selectId?: string) => {
      const path = PathUtil.getPathByElement(context.board, root);
      if (!next || !path) return;
      const ops: Operation[] = BoardUtil.diffNode(root, next, path);
      const selected = selectId && MindUtil.findNodeInTree(next, selectId);
      if (selected)
        ops.push({
          type: "set_selection",
          properties: context.board.selection,
          newProperties: { selectArea: null, selectedElements: [selected] },
        });
      BoardUtil.normalizeOperations(ops);
      context.board.apply(ops);
    };
    const items: PluginContextMenuItem[] = [
      {
        key: "mind-summary",
        label: hint ? `概要（${hint}）` : "概要",
        icon: <Braces size={14} />,
        shortcut: this.shortcut("mod+shift+s"),
        disabled: !adjacent,
        priority: 104,
        onSelect: () => {
          const result = MindUtil.addSummary(root, ids, [
            { type: "paragraph", children: [{ type: "formatted", text: "概要" }] },
          ] as MindNodeElement["text"]);
          if (result) commit(result.root, result.summaryId);
        },
      },
      {
        key: "mind-boundary",
        label: hint ? `外框（${hint}）` : "外框",
        icon: <BoxSelect size={14} />,
        shortcut: this.shortcut("mod+shift+b"),
        disabled: !adjacent,
        priority: 105,
        onSelect: () => commit(MindUtil.addBoundary(root, ids)?.root),
      },
    ];
    if (ids.length === 1)
      items.push({
        key: "mind-relation",
        label: "添加联系线",
        icon: <Spline size={14} />,
        shortcut: this.shortcut("mod+l"),
        priority: 106,
        onSelect: () => startMindRelation(context.board, ids[0]),
      });
    // 右键的节点是外框的首个节点时，可编辑或删除该外框
    const node = context.targetElements.find(el => el.type === "mind-node");
    const parent = node && MindUtil.findParentInTree(root, node.id);
    for (const boundary of parent?.boundaries ?? []) {
      if (!MindUtil.rangeNodes(root, parent!, boundary).some(n => n.id === node!.id)) continue;
      items.push({
        key: `mind-boundary-${boundary.id}`,
        label: boundary.title ? `外框「${boundary.title}」` : "外框",
        icon: <BoxSelect size={14} />,
        priority: 107,
        onSelect: () => {},
        children: [
          {
            key: "mind-boundary-title",
            label: boundary.title ? "编辑外框标题" : "添加外框标题",
            icon: <Type size={14} />,
            priority: 0,
            onSelect: () => context.board.emit(EDIT_BOUNDARY_EVENT, boundary.id),
          },
          {
            key: "mind-boundary-remove",
            label: "删除外框",
            icon: <Trash2 size={14} />,
            danger: true,
            priority: 1,
            onSelect: () => commit(MindUtil.removeBoundary(root, boundary.id)),
          },
        ],
      });
    }
    return items;
  }

  /** 根节点「展开到」：层级数随导图实际深度，最多到第 5 层 */
  private expandToMenu(root: MindNodeElement): PluginContextMenuItem {
    const deepest = Math.min(MindUtil.maxLevel(root) - 1, 5);
    return {
      key: "mind-expand-to",
      label: "展开到",
      icon: <ListTree size={14} />,
      priority: 104,
      onSelect: () => {},
      children: [
        ...Array.from({ length: Math.max(deepest, 1) }, (_, i) => ({
          key: `mind-expand-to-${i + 1}`,
          label: `第 ${i + 1} 层`,
          shortcut: this.shortcut(`alt+${i + 1}`),
          priority: i,
          onSelect: (ctx: ContextMenuContext) =>
            this.applyRootChange(ctx, root => MindUtil.expandToLevel(root, i + 1)),
        })),
        {
          key: "mind-expand-to-all",
          label: "全部展开",
          shortcut: this.shortcut("alt+0"),
          priority: 10,
          onSelect: (ctx: ContextMenuContext) =>
            this.applyRootChange(ctx, root => MindUtil.expandToLevel(root, 0)),
        },
      ],
    };
  }

  private expandAllMenu(node: MindNodeElement): PluginContextMenuItem {
    let folded = false;
    MindUtil.dfs(node, {
      before: current => {
        if (MindUtil.visibleChildren(current).length < current.children.length) folded = true;
      },
    });
    return {
      key: "mind-expand-all",
      label: "展开全部子级",
      icon: <ListTree size={14} />,
      shortcut: this.shortcut("mod+shift+."),
      priority: 102,
      disabled: !folded,
      onSelect: (ctx: ContextMenuContext) =>
        this.applyRootChange(ctx, (root, target) => MindUtil.expandAll(root, target.id)),
    };
  }

  private dragState: MindDragState = EMPTY_MIND_DRAG_STATE;

  private cancelDragPreviewFrame: (() => void) | null = null;

  private pendingPointerMove: {
    clientX: number;
    clientY: number;
    pointerId: number;
    altKey: boolean;
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
          ctx.board.setActiveTool(MIND_TOOL_ID);
        },
      });
      if (!context.board.readonly)
        items.push({
          key: "paste-as-mindmap",
          label: "粘贴为思维导图",
          icon: <ClipboardPaste size={14} />,
          priority: 131,
          onSelect: (ctx: ContextMenuContext) => void this.pasteAsMindMap(ctx),
        });
    }

    // 右键点击 MindNode
    const mindNode = targetElements.find(el => el.type === "mind-node") as
      | MindNodeElement
      | undefined;
    if (mindNode) {
      const root = MindUtil.getRoot(context.board, mindNode);
      if (!root) return items;

      const isRootNode = MindUtil.isRoot(mindNode);

      if (isRootNode) {
        const bothSides = getMindLayout(root).sides.length > 1;
        // 根节点菜单：单向布局只有一组子节点，不分左右
        items.push({
          key: "add-mind-node",
          label: "添加节点",
          icon: <Plus size={14} />,
          priority: 100,
          children: bothSides
            ? [
                {
                  key: "add-left-child",
                  label: "左子节点",
                  icon: <ArrowLeft size={14} />,
                  priority: 0,
                  onSelect: (ctx: ContextMenuContext) => {
                    const node = ctx.targetElements.find(
                      el => el.type === "mind-node"
                    ) as MindNodeElement;
                    if (!node) return;
                    const currentRoot = MindUtil.getRoot(ctx.board, node);
                    if (!currentRoot) return;

                    // 创建一个新的子节点，设置 direction 为 left
                    const newRoot = MindUtil.addChildWithDirection(
                      currentRoot,
                      node,
                      "left",
                      ctx.board.getFontSize()
                    );
                    if (!newRoot) return;

                    const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
                    if (rootPath) {
                      const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
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
                      el => el.type === "mind-node"
                    ) as MindNodeElement;
                    if (!node) return;
                    const currentRoot = MindUtil.getRoot(ctx.board, node);
                    if (!currentRoot) return;

                    // 创建一个新的子节点，设置 direction 为 right
                    const newRoot = MindUtil.addChildWithDirection(
                      currentRoot,
                      node,
                      "right",
                      ctx.board.getFontSize()
                    );
                    if (!newRoot) return;

                    const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
                    if (rootPath) {
                      const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                      BoardUtil.normalizeOperations(ops);
                      ctx.board.apply(ops);
                    }
                  },
                },
              ]
            : [
                {
                  key: "add-child-node",
                  label: "子节点",
                  icon: <CornerDownRight size={14} />,
                  priority: 0,
                  onSelect: (ctx: ContextMenuContext) => this.addChildFromMenu(ctx),
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
            const node = ctx.targetElements.find(el => el.type === "mind-node") as MindNodeElement;
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

        // 根节点：思维导图分左右两侧收起，单向布局只有一项
        const leftChildren = mindNode.children.filter(child => child.direction === "left");
        const rightChildren = mindNode.children.filter(child => child.direction === "right");

        if (!bothSides && mindNode.children.length > 0) {
          const folded = MindUtil.isFolded(getMindLayout(root), mindNode, "right");
          items.push({
            key: "toggle-fold",
            label: folded ? "展开节点" : "收起节点",
            icon: folded ? <ChevronDown size={14} /> : <ChevronUp size={14} />,
            priority: 102,
            onSelect: (ctx: ContextMenuContext) => this.toggleFoldFromMenu(ctx, "right"),
          });
        }

        if (bothSides && leftChildren.length > 0) {
          items.push({
            key: "toggle-left-fold",
            label: mindNode.isLeftFold ? "展开左侧" : "收起左侧",
            icon: mindNode.isLeftFold ? <ChevronDown size={14} /> : <ChevronUp size={14} />,
            priority: 102,
            onSelect: (ctx: ContextMenuContext) => {
              const node = ctx.targetElements.find(
                el => el.type === "mind-node"
              ) as MindNodeElement;
              if (!node) return;
              const currentRoot = MindUtil.getRoot(ctx.board, node);
              if (!currentRoot) return;

              const newRoot = MindUtil.toggleFold(currentRoot, node, "left");
              const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
              if (rootPath) {
                const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                BoardUtil.normalizeOperations(ops);
                ctx.board.apply(ops);
              }
            },
          });
        }

        if (bothSides && rightChildren.length > 0) {
          items.push({
            key: "toggle-right-fold",
            label: mindNode.isRightFold ? "展开右侧" : "收起右侧",
            icon: mindNode.isRightFold ? <ChevronDown size={14} /> : <ChevronUp size={14} />,
            priority: 103,
            onSelect: (ctx: ContextMenuContext) => {
              const node = ctx.targetElements.find(
                el => el.type === "mind-node"
              ) as MindNodeElement;
              if (!node) return;
              const currentRoot = MindUtil.getRoot(ctx.board, node);
              if (!currentRoot) return;

              const newRoot = MindUtil.toggleFold(currentRoot, node, "right");
              const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
              if (rootPath) {
                const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                BoardUtil.normalizeOperations(ops);
                ctx.board.apply(ops);
              }
            },
          });
        }

        if (mindNode.children.length > 0) items.push(this.expandToMenu(root));
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
                  el => el.type === "mind-node"
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                const newRoot = MindUtil.addSiblingBefore(currentRoot, node);
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
                if (rootPath) {
                  const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
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
                  el => el.type === "mind-node"
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                const newRoot = MindUtil.addSibling(
                  currentRoot,
                  node,
                  undefined,
                  ctx.board.getFontSize()
                );
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
                if (rootPath) {
                  const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
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
                  el => el.type === "mind-node"
                ) as MindNodeElement;
                if (!node) return;
                const currentRoot = MindUtil.getRoot(ctx.board, node);
                if (!currentRoot) return;

                const newRoot = MindUtil.addChild(
                  currentRoot,
                  node,
                  undefined,
                  undefined,
                  ctx.board.getFontSize()
                );
                if (!newRoot) return;

                const rootPath = PathUtil.getPathByElement(ctx.board, currentRoot);
                if (rootPath) {
                  const ops = BoardUtil.diffNode(currentRoot, newRoot, rootPath);
                  BoardUtil.normalizeOperations(ops);
                  ctx.board.apply(ops);
                }
              },
            },
          ],
          onSelect: () => {},
        });

        // 非根节点：收起 / 展开，以及展开下面全部层级
        if (mindNode.children.length > 0) {
          const collapsed = MindUtil.isCollapsed(mindNode);
          items.push(
            {
              key: "toggle-fold",
              label: collapsed ? "展开节点" : "收起节点",
              icon: collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />,
              shortcut: this.shortcut("mod+."),
              priority: 101,
              onSelect: (ctx: ContextMenuContext) =>
                this.applyRootChange(ctx, (root, node) => MindUtil.toggleCollapsed(root, node.id)),
            },
            this.expandAllMenu(mindNode)
          );
        }
      }

      items.push(...this.rangeMenu(context, root));

      // 笔记相关菜单项（根节点与非根节点通用）
      if (mindNode.contentId) {
        items.push({
          key: "mind-open-note",
          label: "打开笔记",
          icon: <StickyNote size={14} />,
          priority: 150,
          onSelect: (ctx: ContextMenuContext) => {
            const node = ctx.targetElements.find(el => el.type === "mind-node") as MindNodeElement;
            if (!node?.contentId) return;
            ctx.board.emit("tau.note.open", node.contentId, node.contentTitle);
          },
        });

        items.push({
          key: "mind-unlink-note",
          label: "取消关联笔记",
          icon: <Unlink size={14} />,
          priority: 151,
          danger: true,
          onSelect: (ctx: ContextMenuContext) => {
            const node = ctx.targetElements.find(el => el.type === "mind-node") as MindNodeElement;
            if (!node?.contentId) return;
            ctx.board.emit("tau.mind.confirm-unlink-note", node.id);
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
                  el => el.type === "mind-node"
                ) as MindNodeElement;
                if (!node) return;
                const canSubmit = ctx.board.captureSubmission(node);
                if (!canSubmit()) return;
                const contentId = await this.text.create?.(DEFAULT_CONTENT, 0);
                if (!contentId) return;
                const current = BoardUtil.getElementById(ctx.board, node.id);
                const nodePath = current && PathUtil.getPathByElement(ctx.board, current);
                if (!canSubmit() || !nodePath || current?.contentId !== node.contentId) {
                  await this.text.release?.(contentId);
                  return;
                }
                if (ctx.board.document?.linkEntity) {
                  try {
                    if (!(await ctx.board.document.linkEntity(node.id, "content", contentId))) {
                      await this.text.release?.(contentId);
                      return;
                    }
                  } catch (error) {
                    await this.text.release?.(contentId);
                    throw error;
                  }
                  ctx.board.emit("tau.note.open", contentId, "");
                  return;
                }
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
                ctx.board.emit("tau.note.open", contentId, "");
              },
            },
            {
              key: "mind-select-note",
              label: "选择笔记",
              icon: <Search size={14} />,
              priority: 1,
              onSelect: (ctx: ContextMenuContext) => {
                const node = ctx.targetElements.find(
                  el => el.type === "mind-node"
                ) as MindNodeElement;
                if (!node) return;
                ctx.board.emit("tau.mind.select-note", node.id);
              },
            },
          ],
          onSelect: () => {},
        });
      }
    }

    return items;
  }

  /** 联系线模式下点到另一个节点：插入联系线并退出模式 */
  private finishRelation(board: Board, target: MindNodeElement) {
    const { sourceId } = relationStoreOf(board).getState();
    if (!sourceId) return false;
    cancelMindRelation(board);
    const source = BoardUtil.getElementById(board, sourceId) as MindNodeElement | null;
    if (!source || source.id === target.id) return true;
    const arrow = createMindRelation(source, target);
    board.apply([
      { type: "insert_node", path: [board.children.length], node: arrow },
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectArea: null, selectedElements: [arrow] },
      },
    ]);
    return true;
  }

  /** 联系线模式下点空白处取消 */
  onPointerDown(_e: PointerEvent, board: Board) {
    if (!relationStoreOf(board).getState().sourceId) return;
    cancelMindRelation(board);
    return false;
  }

  onGlobalPointerMove(e: PointerEvent, board: Board) {
    const store = relationStoreOf(board);
    if (!store.getState().sourceId) return;
    const pointer = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (pointer) store.setState({ pointer });
  }

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (e.key !== "Escape" || !relationStoreOf(board).getState().sourceId) return;
    cancelMindRelation(board);
    return false;
  }

  /** 联系线端点：节点被收起时接到最近的可见祖先上 */
  getArrowBindPoint(
    board: Board,
    element: BoardElement,
    connectId: string,
    _offset?: CustomOffset,
    children = board.children
  ) {
    const { node } = visibleRelationEnd(board, element as MindNodeElement, children);
    const { x, y, width, height } = node;
    switch (connectId) {
      case ARROW_CONNECT_ID.LEFT:
        return { x, y: y + height / 2 };
      case ARROW_CONNECT_ID.RIGHT:
        return { x: x + width, y: y + height / 2 };
      case ARROW_CONNECT_ID.TOP:
        return { x: x + width / 2, y };
      case ARROW_CONNECT_ID.BOTTOM:
        return { x: x + width / 2, y: y + height };
      default:
        return { x: x + width / 2, y: y + height / 2 };
    }
  }

  isHit(_board: Board, element: MindNodeElement, x: number, y: number) {
    // 若节点在折叠状态（被父级或祖先按其方向折叠而隐藏），直接不可命中
    const root = MindUtil.getRoot(_board, element);
    if (root) {
      let isVisible = false;
      MindUtil.dfs(
        root,
        {
          before: current => {
            if (current.id === element.id) {
              isVisible = true;
            }
          },
        },
        null,
        0,
        true
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
    return MindUtil.getSubtreeBounds(element);
  }

  isElementSelected(
    board: Board,
    element: MindNodeElement,
    selectArea: Selection["selectArea"] = board.selection.selectArea
  ) {
    if (!selectArea) return false;
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(element, selectRect);
  }

  private emitChange() {
    this.listeners.forEach(listener => listener());
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

  /**
   * 思维导图节点拖拽的手势声明：pointerdown 命中 mind-node 且节点可移动时，
   * 初始化拖拽状态机并返回 MindDragInteraction 交由交互内核接管路由。
   * （原 onPointerDown 的 return false 抢占已由内核仲裁取代）
   */
  claimPointerGesture(
    board: Board,
    e: PointerEvent,
    hitElement: BoardElement
  ): InteractionState | null {
    if (e.button !== 0 || board.readonly || board.presentationManager.isPresentationMode) {
      return null;
    }

    if (hitElement.type !== "mind-node") return null;
    const mindNode = hitElement as MindNodeElement;
    if (this.finishRelation(board, mindNode)) {
      e.preventDefault();
      return new FinishedInteraction();
    }

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
    return Boolean(this.dragState.draggedNode) && this.dragState.pointerId === pointerId;
  }

  /** 拖拽移动调度（rAF 合帧，原 onGlobalPointerMove 主体） */
  scheduleDragPreview(e: PointerEvent, board: Board) {
    this.pendingPointerMove = {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerId: e.pointerId,
      altKey: e.altKey,
    };

    if (!this.cancelDragPreviewFrame) {
      const update = () => {
        this.cancelDragPreviewFrame = null;
        const pending = this.pendingPointerMove;
        this.pendingPointerMove = null;
        if (!pending || pending.pointerId !== this.dragState.pointerId) return;
        this.updateDragPreview(board, pending.clientX, pending.clientY, pending.altKey);
      };
      if (globalThis.requestAnimationFrame && globalThis.cancelAnimationFrame) {
        const frame = globalThis.requestAnimationFrame(update);
        this.cancelDragPreviewFrame = () => globalThis.cancelAnimationFrame(frame);
      } else {
        const timer = globalThis.setTimeout(update, 16);
        this.cancelDragPreviewFrame = () => globalThis.clearTimeout(timer);
      }
    }
  }

  /** 拖拽收尾：提交落点或越界取消；未构成拖拽的点击回落为点选（原 onGlobalPointerUp 主体） */
  finishDrag(e: PointerEvent, board: Board) {
    this.cancelScheduledPointerMove();
    if (!this.isPointerInsideBoard(board, e.clientX, e.clientY)) {
      this.cancelDrag(board);
      return;
    }

    this.updateDragPreview(board, e.clientX, e.clientY, e.altKey);
    if (this.dragState.isDragging) {
      this.commitDrop(board);
    }
    if (this.dragState.mode === "root-translate" && this.dragState.isDragging) {
      board.emit("element:move-end");
    } else if (!this.dragState.isDragging) {
      this.selectClickedNode(e, board);
    }

    this.cleanup(board);
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
      const existingIndex = current.findIndex(el => el.id === latestNode.id);
      selectedElements =
        existingIndex >= 0
          ? current.filter(el => el.id !== latestNode.id)
          : [...current, latestNode];
    } else {
      selectedElements = [latestNode];
    }

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements,
    });
  }

  updateDragPreview(board: Board, clientX: number, clientY: number, altKey = false) {
    const { draggedNode, startPoint, dragOffset, currentTarget } = this.dragState;
    if (!draggedNode || !startPoint) return;

    const currentPoint = PointUtil.screenToViewPort(board, clientX, clientY);
    if (!currentPoint) return;

    const distanceFromStart = Math.hypot(
      currentPoint.x - startPoint.x,
      currentPoint.y - startPoint.y
    );
    const isDragging =
      this.dragState.isDragging || distanceFromStart > 5 / Math.max(board.viewPort.zoom, 0.01);
    if (!isDragging) return;

    // 拖拽首次越过阈值时隐藏选中态（点击场景保留选区供点选回落）
    if (
      !this.dragState.isDragging &&
      (board.selection.selectedElements.length > 0 || board.selection.selectArea)
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
        false
      );
    }

    const nextX = currentPoint.x - dragOffset.x;
    const nextY = currentPoint.y - dragOffset.y;
    let previewNode: MindNodeElement;
    let target: MindDragTarget | null;

    if (this.dragState.mode === "root-translate") {
      const latestRoot = BoardUtil.getElementById(board, draggedNode.id) as MindNodeElement | null;
      const rootPath = latestRoot ? PathUtil.getPathByElement(board, latestRoot) : null;
      if (!latestRoot || latestRoot.type !== "mind-node" || !rootPath) return;

      target = MindUtil.findNearestMindNode(
        board,
        { ...latestRoot, x: nextX, y: nextY },
        currentTarget
      );

      // 吸附优先级：有合并候选时优先合并吸附；无候选且未按 Alt 时
      // 与其他元素对齐吸附（与通用拖拽管线同规则）
      const { dx, dy } = board.snap.move({
        elements: [latestRoot],
        bounds: { x: nextX, y: nextY, width: latestRoot.width, height: latestRoot.height },
        enabled: !target && !altKey,
      });
      const snapX = nextX + dx;
      const snapY = nextY + dy;

      if (currentTarget?.direction !== target?.direction) {
        const desiredRoot = MindUtil.createRootDragLayout(
          draggedNode,
          { x: nextX, y: nextY },
          target?.direction ?? null
        );
        const layoutOperations = BoardUtil.diffNode(latestRoot, desiredRoot, rootPath);
        if (layoutOperations.length > 0) {
          BoardUtil.normalizeOperations(layoutOperations);
          board.apply(layoutOperations, false);
        }
      } else {
        const translateOperations = BoardUtil.buildTranslateSubtreeOps(
          latestRoot,
          rootPath,
          snapX - latestRoot.x,
          snapY - latestRoot.y
        );
        if (translateOperations.length > 0) {
          board.apply(translateOperations, false);
        }
      }

      const movedRoot = BoardUtil.getElementById(board, draggedNode.id) as MindNodeElement | null;
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
    const connectionLineColor = target ? this.getConnectionLineColor(board, target.node) : null;

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
    const mode = useThemeStore.getState().mode === "dark" ? "dark" : "light";
    // 拖入后成为 targetNode 的子节点：挂到根上是新分支（取下一个分支色），否则沿用目标所在分支
    const branchIndex =
      targetNode.level === 1
        ? targetNode.children.length
        : MindThemeUtil.getBranchIndex(root, targetNode.id);
    return MindThemeUtil.getNodeVisual(
      MindThemeUtil.getThemeOf(root),
      targetNode.level + 1,
      branchIndex,
      mode
    ).lineColor;
  }

  commitDrop(board: Board) {
    const { draggedNode, sourceRootId, previewNode, currentTarget } = this.dragState;
    if (!draggedNode || !sourceRootId || !previewNode) return;

    const sourceRoot = BoardUtil.getElementById(board, sourceRootId) as MindNodeElement | null;
    if (!sourceRoot || sourceRoot.type !== "mind-node") return;

    const latestDraggedNode = MindUtil.findNodeInTree(sourceRoot, draggedNode.id);
    if (!latestDraggedNode || !MindUtil.canMoveNode(sourceRoot, latestDraggedNode)) {
      return;
    }

    const sourcePath = PathUtil.getPathByElement(board, sourceRoot);
    if (!sourcePath) return;

    const nodePath = PathUtil.getPathByElement(board, latestDraggedNode);
    if (!nodePath) return;
    const operations: Operation[] = [];
    // 本机根拖动的实时预览不记历史，合并时补记预览前的属性以便一步撤销。
    if (!board.document && currentTarget && MindUtil.isRoot(latestDraggedNode)) {
      const recordPreview = (
        initial: MindNodeElement,
        current: MindNodeElement,
        path: number[]
      ) => {
        operations.push(...BoardUtil.diffNodePatchOnly(initial, current, path));
        current.children.forEach((child, index) => {
          const previous = initial.children.find(node => node.id === child.id);
          if (previous) recordPreview(previous, child, [...path, index]);
        });
      };
      recordPreview(draggedNode, latestDraggedNode, nodePath);
    }
    const moveAndLayout = (move: MoveNodeOperation, roots: MindNodeElement[]) => {
      const moved = BoardOperations.applyToChildren(board.children, [move]);
      operations.push(move);
      for (const root of roots) {
        const oldPath = PathUtil.getPathByElement(board, root);
        const path = oldPath && PathUtil.transformPath(oldPath, move);
        const before = path && PathUtil.getElement(moved, path);
        if (!before || !path) throw new Error("移动后的导图路径已失效");
        operations.push(...BoardUtil.diffNode(before, root, path));
      }
    };
    if (currentTarget) {
      const targetNode = BoardUtil.getElementById(
        board,
        currentTarget.node.id
      ) as MindNodeElement | null;
      if (
        !targetNode ||
        targetNode.type !== "mind-node" ||
        !MindUtil.isValidDrop(latestDraggedNode, targetNode) ||
        (!MindUtil.isRoot(targetNode) && targetNode.direction !== currentTarget.direction)
      ) {
        return;
      }

      const targetRoot = MindUtil.getRoot(board, targetNode);
      const targetPath = targetRoot ? PathUtil.getPathByElement(board, targetRoot) : null;
      if (!targetRoot || !targetPath) return;

      const placement = MindUtil.calculateInsertPosition(
        targetNode,
        {
          x: previewNode.x + previewNode.width / 2,
          y: previewNode.y + previewNode.height / 2,
        },
        currentTarget.direction,
        latestDraggedNode.id,
        getMindLayout(targetRoot)
      );

      const parentPath = PathUtil.getPathByElement(board, targetNode);
      if (!parentPath) return;
      const sameParent =
        nodePath.length === parentPath.length + 1 &&
        parentPath.every((index, i) => index === nodePath[i]);
      const index =
        placement.insertIndex +
        (sameParent && nodePath[nodePath.length - 1] <= placement.insertIndex ? 1 : 0);
      const move: MoveNodeOperation = {
        type: "move_node",
        path: nodePath,
        newPath: [...parentPath, index],
      };
      if (targetRoot.id === sourceRoot.id) {
        const updatedRoot = MindUtil.layout(
          MindUtil.moveNodeToNewParent(
            sourceRoot,
            sourceRoot,
            latestDraggedNode,
            targetNode,
            placement.insertIndex,
            placement.direction
          )
        );
        moveAndLayout(move, [updatedRoot]);
      } else {
        const updatedTargetRoot = MindUtil.layout(
          MindUtil.moveNodeToNewParent(
            sourceRoot,
            targetRoot,
            latestDraggedNode,
            targetNode,
            placement.insertIndex,
            placement.direction
          )
        );

        const roots = MindUtil.isRoot(latestDraggedNode)
          ? [updatedTargetRoot]
          : [MindUtil.deleteNode(sourceRoot, latestDraggedNode), updatedTargetRoot];
        moveAndLayout(move, roots);
      }
    } else {
      if (MindUtil.isRoot(latestDraggedNode)) {
        operations.push(
          ...BoardUtil.buildTranslateSubtreeOps(
            draggedNode,
            sourcePath,
            previewNode.x - draggedNode.x,
            previewNode.y - draggedNode.y
          )
        );
      } else {
        const updatedSourceRoot = MindUtil.deleteNode(sourceRoot, latestDraggedNode);
        const independentRoot = MindUtil.createNewRootNode(latestDraggedNode, {
          x: previewNode.x,
          y: previewNode.y,
        });
        moveAndLayout({ type: "move_node", path: nodePath, newPath: [board.children.length] }, [
          updatedSourceRoot,
          independentRoot,
        ]);
      }
    }

    if (operations.length === 0) return;
    board.apply(withMindRelationRemovals(board, operations));
  }

  isPointerInsideBoard(board: Board, clientX: number, clientY: number) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    );
  }

  setDragState(nextState: MindDragState) {
    this.dragState = nextState;
    this.emitChange();
  }

  cancelScheduledPointerMove() {
    this.cancelDragPreviewFrame?.();
    this.cancelDragPreviewFrame = null;
    this.pendingPointerMove = null;
  }

  cancelDrag(board: Board) {
    const { mode, isDragging, draggedNode } = this.dragState;
    if (mode === "root-translate" && isDragging && draggedNode) {
      const latestRoot = BoardUtil.getElementById(board, draggedNode.id) as MindNodeElement | null;
      const rootPath = latestRoot ? PathUtil.getPathByElement(board, latestRoot) : null;
      if (latestRoot?.type === "mind-node" && rootPath) {
        const restoreOperations = BoardUtil.diffNode(latestRoot, draggedNode, rootPath);
        if (restoreOperations.length > 0) {
          BoardUtil.normalizeOperations(restoreOperations);
          board.apply(restoreOperations, false);
        }
        board.emit("element:move-end");
      }
    }

    this.cleanup(board);
  }

  private cleanup(board: Board) {
    this.cancelScheduledPointerMove();
    // 清除拖拽期间的对齐参考线
    board.snap.end();
    this.setDragState(EMPTY_MIND_DRAG_STATE);
  }

  render(_board: Board, { element, children }: { element: MindNodeElement; children?: ReactNode }) {
    return <MindNodeTree key={element.id} plugin={this} element={element} children={children} />;
  }
}

export default MindPlugin;

/** 联系线落点已在 claim 阶段处理完，只消费本次按下 */
class FinishedInteraction implements InteractionState {
  readonly name = "mind-relation";
  isFinished = true;
}

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

  onExit(board: Board): void {
    if (!this.isFinished) this.plugin.cancelDrag(board);
  }

  onKeyDown(e: KeyboardEvent, board: Board): boolean {
    if (e.key !== "Escape") return false;
    this.plugin.cancelDrag(board);
    this.isFinished = true;
    return true;
  }
}
