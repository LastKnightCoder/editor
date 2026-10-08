import React, { useMemo, useState, useCallback } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  Ellipsis,
  PencilLine,
  Trash2,
} from "lucide-react";
import { ContextMenu, Menu, cn } from "@tau/ui";
import { Board, BoardElement, MindNodeElement, Operation } from "../../../types";
import { useBoard } from "../../../hooks";
import { useElementDnD, DragPosition } from "./useElementDnD";
import {
  PathUtil,
  BoardUtil,
  MindUtil,
  getLayerOrderActionState,
  executeLayerOrderAction,
} from "../../../utils";
import { ViewPortTransforms } from "../../../transforms/ViewPortTransforms";
import { elementLabel, elementTypeMeta } from "./typeMeta";
import {
  simulateChildrenAfterOps,
  buildFrameResizeOp,
  collectMindLayoutOpsFromPreview,
  canDropElementIntoParent,
} from "./utils";

interface NodeProps {
  element: BoardElement;
  depth: number;
  selectedIds: Set<string>;
  /** 平铺（查找结果）：不带折叠箭头与子元素 */
  flat?: boolean;
}

// 拖拽指示器（accent 细线 / 容器内描边）
const TOP_DROP_INDICATOR_CLASS =
  "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-accent before:content-['']";
const BOTTOM_DROP_INDICATOR_CLASS =
  "before:absolute before:inset-x-1 before:-bottom-px before:h-0.5 before:rounded-full before:bg-accent before:content-['']";
const INSIDE_DROP_INDICATOR_CLASS = "ring-1 ring-inset ring-accent bg-accent-soft";

const Node: React.FC<NodeProps> = ({ element, depth, selectedIds, flat }) => {
  const board = useBoard();
  const [expanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState<string>(element.name ?? "");

  const hasChildren = !flat && Array.isArray(element.children) && element.children.length > 0;
  const isSelected = selectedIds.has(element.id);

  const meta = elementTypeMeta(element.type);
  const displayName = elementLabel(element, id => BoardUtil.getElementById(board, id));
  const childCount = hasChildren ? element.children!.length : 0;
  const capService = board.capabilityService;

  const elementPath = useMemo(
    () => PathUtil.getPathByElement(board, element) ?? [],
    [board, element]
  );
  const parentPath = useMemo(
    () => (elementPath.length > 0 ? elementPath.slice(0, -1) : null),
    [elementPath]
  );
  // 使用能力查询判断是否是容器
  const isContainer = capService.isContainer(element);
  const { drag, drop, dropContainerRef, isOver, canDrop, dragPosition } = useElementDnD(
    { elementId: element.id, path: elementPath, parentPath },
    {
      canDropExtra: (dragItem, _dropItem, position) => {
        const dragEl = BoardUtil.getElementById(board, dragItem.elementId);
        if (!dragEl) return false;
        // Inside 放置需要容器校验；Top/Bottom 需要校验目标父级是否能包含拖拽元素。
        if (position !== DragPosition.Inside) {
          const dropParentPath = elementPath.slice(0, -1);
          const targetParent =
            dropParentPath.length > 0
              ? (PathUtil.getElementByPath(board, dropParentPath) as BoardElement | null)
              : null;
          return canDropElementIntoParent(board as Board, targetParent, dragEl);
        }
        if (!isContainer) return false;
        // 使用能力查询检查容器是否可以包含拖拽元素
        return capService.canContain(element, dragEl);
      },
      onDrop: async (dragItem, dropItem, position) => {
        // 使用实时路径，避免拖拽开始与放下之间的路径变化
        const dragElCurrent = BoardUtil.getElementById(board, dragItem.elementId);
        const fromPath =
          (dragElCurrent && PathUtil.getPathByElement(board, dragElCurrent)) || dragItem.path;
        if (position === DragPosition.Inside) {
          if (!isContainer) return;
          let dragEl = BoardUtil.getElementById(board, dragItem.elementId);
          if (!dragEl) return;
          // 使用能力查询检查容器是否可以包含拖拽元素
          if (!capService.canContain(element, dragEl)) return;

          // 查找拖拽元素原来所在的容器
          let sourceContainer: BoardElement | null = null;
          BoardUtil.dfs(board, (el: BoardElement) => {
            if (capService.isContainer(el) && el.id !== element.id) {
              if (capService.isChildInContainer(el, dragEl!)) {
                sourceContainer = el;
              }
            }
          });

          // 记录源 mind 根节点（在移动之前）- 对于需要重新布局的元素
          let sourceMindRootId: string | null = null;
          const dragRequiresRelayout = capService.requiresRelayout(dragEl);
          if (dragRequiresRelayout) {
            const sourceRoot = MindUtil.getRoot(
              board as Board,
              dragEl as unknown as MindNodeElement
            );
            sourceMindRootId = sourceRoot?.id ?? null;
          }

          // 使用容器协议准备元素（设置 resizable、autoHeight 等属性）
          const preparedElement = await capService.prepareElementForInsertion(element, dragEl);

          // 关键修复：异步操作后重新获取最新的容器状态
          // 因为在 await 期间，Board 状态可能已经改变
          const latestElement = BoardUtil.getElementById(board, element.id);
          if (!latestElement) {
            console.warn("Target container not found after prepareElementForInsertion");
            return;
          }

          // 如果元素属性变化了，先更新元素
          const pendingOps: Operation[] = [];
          if (
            preparedElement.width !== dragEl.width ||
            preparedElement.height !== dragEl.height ||
            preparedElement.resizable !== dragEl.resizable ||
            preparedElement.autoHeight !== dragEl.autoHeight
          ) {
            pendingOps.push({
              type: "set_node",
              path: fromPath,
              properties: {
                width: dragEl.width,
                height: dragEl.height,
                resizable: (dragEl as any).resizable,
                autoHeight: (dragEl as any).autoHeight,
              },
              newProperties: {
                width: preparedElement.width,
                height: preparedElement.height,
                resizable: (preparedElement as any).resizable,
                autoHeight: (preparedElement as any).autoHeight,
              },
            });
            // 更新 dragEl 引用以便后续使用
            dragEl = preparedElement;
          }

          // 使用最新的容器状态计算路径
          const latestTargetPath = PathUtil.getPathByElement(board, latestElement) || elementPath;
          const newPath = [...latestTargetPath, latestElement.children?.length ?? 0];
          pendingOps.push({ type: "move_node", path: fromPath, newPath });
          const previewChildren = simulateChildrenAfterOps(board, pendingOps);
          let layoutOpsCount = 0;

          // 对于需要带子元素移动的容器，需要调整大小
          if (capService.shouldMoveWithChildren(element)) {
            const resizeOp = buildFrameResizeOp(
              board as Board,
              previewChildren,
              element.id,
              elementPath
            );
            if (resizeOp) {
              pendingOps.push(resizeOp);
            }
          }

          // 对于需要重新布局的元素，收集布局操作
          if (dragRequiresRelayout) {
            const layoutOps = collectMindLayoutOpsFromPreview(
              board as Board,
              previewChildren,
              dragItem.elementId,
              sourceMindRootId
            );
            layoutOpsCount = layoutOps.length;
            pendingOps.push(...layoutOps);
          }

          board.apply(pendingOps, true);

          // 触发容器协议回调
          // 如果从其他容器移出，通知源容器
          if (sourceContainer !== null) {
            const latestSourceContainer = BoardUtil.getElementById(
              board,
              (sourceContainer as BoardElement).id
            );
            if (latestSourceContainer) {
              capService.notifyChildRemoved(latestSourceContainer, dragEl);
            }
          }
          // 通知目标容器有新元素插入
          const latestTargetContainer = BoardUtil.getElementById(board, element.id);
          if (latestTargetContainer) {
            capService.notifyChildInserted(latestTargetContainer);
          }

          if (dragRequiresRelayout && layoutOpsCount === 0) {
            MindUtil.relayoutAffectedRootsAfterMindMove(
              board as Board,
              dragItem.elementId,
              sourceMindRootId
            );
          }
          return;
        }

        // Top/Bottom: 插到目标节点父级；考虑反向渲染
        const latestDropTarget = BoardUtil.getElementById(board, dropItem.elementId);
        const latestDropPath =
          (latestDropTarget && PathUtil.getPathByElement(board, latestDropTarget)) || dropItem.path;
        const dropIndex = latestDropPath[latestDropPath.length - 1];
        const parent = latestDropPath.slice(0, -1);
        const dragEl2 = BoardUtil.getElementById(board, dragItem.elementId);

        // 查找拖拽元素原来所在的容器
        let sourceContainer2: BoardElement | null = null;
        if (dragEl2) {
          BoardUtil.dfs(board, (el: BoardElement) => {
            if (capService.isContainer(el)) {
              if (capService.isChildInContainer(el, dragEl2)) {
                sourceContainer2 = el;
              }
            }
          });
        }

        // 获取目标父级元素
        const targetParentEl =
          parent.length > 0
            ? (PathUtil.getElementByPath(board, parent) as BoardElement | null)
            : null;

        // Top/Bottom 会插到目标节点的父级，必须同时满足父级容器的包含规则。
        if (dragEl2 && !canDropElementIntoParent(board as Board, targetParentEl, dragEl2)) {
          return;
        }
        // 根据父级列表的展示顺序决定插入索引：
        // - 使用能力查询判断子元素渲染顺序
        // 在移动前记录源 mind 根节点，移动后获取最新 root 并重新布局
        let sourceMindRootIdForReorder: string | null = null;
        const dragRequiresRelayout2 = dragEl2 ? capService.requiresRelayout(dragEl2) : false;
        if (dragRequiresRelayout2 && dragEl2) {
          const sourceRoot = MindUtil.getRoot(board as Board, dragEl2 as MindNodeElement);
          sourceMindRootIdForReorder = sourceRoot?.id ?? null;
        }
        let isReversed = true; // 默认按当前 UI 的逆序渲染
        if (parent.length > 0 && targetParentEl) {
          // 使用能力查询判断渲染顺序
          isReversed = capService.shouldReverseChildren(targetParentEl);
        } else {
          // 顶层为逆序
          isReversed = true;
        }
        const insertIndex = isReversed
          ? position === DragPosition.Top
            ? dropIndex + 1
            : dropIndex
          : position === DragPosition.Top
            ? dropIndex
            : dropIndex + 1;
        const newPath = [...parent, insertIndex];
        const pendingOps: Operation[] = [{ type: "move_node", path: fromPath, newPath }];
        let layoutOpsCount = 0;
        if (dragEl2 && capService.requiresRelayout(dragEl2)) {
          const previewChildren = simulateChildrenAfterOps(board, pendingOps);
          const layoutOps = collectMindLayoutOpsFromPreview(
            board as Board,
            previewChildren,
            dragItem.elementId,
            sourceMindRootIdForReorder
          );
          layoutOpsCount = layoutOps.length;
          pendingOps.push(...layoutOps);
        }
        board.apply(pendingOps, true);

        // 触发容器协议回调
        // 判断是否从容器移出
        const isMovingOutOfContainer =
          sourceContainer2 !== null &&
          (!targetParentEl || (sourceContainer2 as BoardElement).id !== targetParentEl.id);
        // 判断是否移入新容器
        const isMovingIntoContainer =
          targetParentEl !== null &&
          capService.isContainer(targetParentEl) &&
          (sourceContainer2 === null ||
            (sourceContainer2 as BoardElement).id !== targetParentEl.id);

        if (isMovingOutOfContainer && dragEl2 && sourceContainer2 !== null) {
          const latestSourceContainer = BoardUtil.getElementById(
            board,
            (sourceContainer2 as BoardElement).id
          );
          if (latestSourceContainer) {
            capService.notifyChildRemoved(latestSourceContainer, dragEl2);
          }
        }
        if (isMovingIntoContainer && targetParentEl !== null) {
          const latestTargetContainer = BoardUtil.getElementById(
            board,
            (targetParentEl as BoardElement).id
          );
          if (latestTargetContainer) {
            capService.notifyChildInserted(latestTargetContainer);
          }
        }

        if (dragEl2 && capService.requiresRelayout(dragEl2) && layoutOpsCount === 0) {
          MindUtil.relayoutAffectedRootsAfterMindMove(
            board as Board,
            dragItem.elementId,
            sourceMindRootIdForReorder
          );
        }
      },
    }
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // 设置画布选中
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: { selectedElements: [element], selectArea: null },
        },
        true
      );
      // 居中显示
      ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
    },
    [board, element]
  );

  const startRename = useCallback(() => {
    setTempName(element.name ?? "");
    setIsRenaming(true);
  }, [element]);

  const commitRename = useCallback(() => {
    const newName = tempName.trim();
    if (newName === (element.name ?? "")) {
      setIsRenaming(false);
      return;
    }
    const path = elementPath;
    if (path.length === 0) {
      setIsRenaming(false);
      return;
    }
    board.apply(
      {
        type: "set_node",
        path,
        properties: { name: element.name },
        newProperties: { name: newName },
      },
      true
    );
    setIsRenaming(false);
  }, [board, element.name, elementPath, tempName]);

  const contextMenuTargets = useMemo(() => {
    const selectedElements = board.selection.selectedElements;
    if (!selectedIds.has(element.id) || selectedElements.length <= 1) {
      return [element];
    }
    return selectedElements;
  }, [board, element, selectedIds]);

  const layerActionState = useMemo(
    () => getLayerOrderActionState(board, contextMenuTargets),
    [board, contextMenuTargets]
  );

  const runAction = useCallback(
    (key: string) => {
      if (key === "rename") {
        startRename();
        return;
      }
      if (key === "layer-move-up") {
        executeLayerOrderAction(board, contextMenuTargets, "move-up");
        return;
      }
      if (key === "layer-move-down") {
        executeLayerOrderAction(board, contextMenuTargets, "move-down");
        return;
      }
      if (key === "layer-move-top") {
        executeLayerOrderAction(board, contextMenuTargets, "move-top");
        return;
      }
      if (key === "layer-move-bottom") {
        executeLayerOrderAction(board, contextMenuTargets, "move-bottom");
        return;
      }
      if (key === "delete") {
        // 画布删除本就可撤销（⌘Z），这里与画布 Delete 键一致不再二次确认
        // 需要布局的元素需要特殊处理：非根节点删除后需对其根节点重新布局
        if (capService.requiresRelayout(element)) {
          const mindElement = element as MindNodeElement;
          const root = MindUtil.getRoot(board as Board, mindElement);
          if (!root) return;
          if (root.id === mindElement.id) {
            // 删除根节点：直接 remove
            const currentPath = PathUtil.getPathByElement(board, element);
            if (!currentPath) return;
            board.apply({ type: "remove_node", path: currentPath, node: element }, true);
          } else {
            // 删除非根节点：基于根节点重建并 layout
            const rootPath = PathUtil.getPathByElement(board, root);
            if (!rootPath) return;
            const newRoot = MindUtil.deleteNode(root, mindElement);
            const ops = BoardUtil.diffNode(root, newRoot, rootPath);
            BoardUtil.normalizeOperations(ops);
            board.apply(ops, true);
          }
          return;
        }
        // 其他类型：直接删除，并在需要时合并附加操作
        const currentPath = PathUtil.getPathByElement(board, element);
        if (!currentPath) return;
        const pendingOps: Operation[] = [{ type: "remove_node", path: currentPath, node: element }];
        const previewChildren = simulateChildrenAfterOps(board, pendingOps);
        if (parentPath && parentPath.length > 0) {
          const parentEl = PathUtil.getElementByPath(board, parentPath) as BoardElement | null;
          if (parentEl?.type === "frame") {
            const resizeOp = buildFrameResizeOp(
              board as Board,
              previewChildren,
              parentEl.id,
              parentPath
            );
            if (resizeOp) {
              pendingOps.push(resizeOp);
            }
          }
        }
        board.apply(pendingOps, true);
        return;
      }
    },
    [board, element, parentPath, startRename, contextMenuTargets, capService]
  );

  const menuItems = (
    <>
      <Menu.Item
        icon={<PencilLine size={15} strokeWidth={1.75} />}
        onSelect={() => runAction("rename")}
      >
        重命名
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        icon={<ArrowUp size={15} strokeWidth={1.75} />}
        disabled={layerActionState.moveUpDisabled}
        onSelect={() => runAction("layer-move-up")}
      >
        上移一层
      </Menu.Item>
      <Menu.Item
        icon={<ArrowDown size={15} strokeWidth={1.75} />}
        disabled={layerActionState.moveDownDisabled}
        onSelect={() => runAction("layer-move-down")}
      >
        下移一层
      </Menu.Item>
      <Menu.Item
        icon={<ArrowUpToLine size={15} strokeWidth={1.75} />}
        disabled={layerActionState.moveTopDisabled}
        onSelect={() => runAction("layer-move-top")}
      >
        移至顶层
      </Menu.Item>
      <Menu.Item
        icon={<ArrowDownToLine size={15} strokeWidth={1.75} />}
        disabled={layerActionState.moveBottomDisabled}
        onSelect={() => runAction("layer-move-bottom")}
      >
        移至底层
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        danger
        icon={<Trash2 size={15} strokeWidth={1.75} />}
        onSelect={() => runAction("delete")}
      >
        删除
      </Menu.Item>
    </>
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const TypeIcon = meta.icon;

  return (
    <div className="relative">
      <ContextMenu content={menuItems}>
        <div
          onClick={onClick}
          className={cn(
            "text-ink-2 hover:bg-hover hover:text-ink-1 group/row text-tau-body relative flex h-8 select-none items-center gap-2 rounded-[8px] pr-1",
            isSelected && "bg-selected text-ink-1 hover:bg-selected",
            isOver && !canDrop ? "cursor-not-allowed" : "cursor-pointer",
            isOver && canDrop && dragPosition === DragPosition.Top && TOP_DROP_INDICATOR_CLASS,
            isOver &&
              canDrop &&
              dragPosition === DragPosition.Bottom &&
              BOTTOM_DROP_INDICATOR_CLASS,
            isOver &&
              canDrop &&
              dragPosition === DragPosition.Inside &&
              isContainer &&
              INSIDE_DROP_INDICATOR_CLASS
          )}
          style={{ paddingLeft: 6 + depth * 16 }}
          ref={el => {
            if (!el) return;
            // 组合连接器：先 drop 再 drag，避免覆盖；搜索结果的平铺行不作 drop 目标（排序语义未定义）
            if (!flat) drop(el);
            drag(el);
            if (!flat) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (dropContainerRef as any).current = el;
            }
          }}
        >
          {/* 折叠箭头占固定槽位（无子元素时留空），行首对齐不跳 */}
          <span className="grid size-3.5 flex-none place-items-center">
            {hasChildren && (
              <button
                type="button"
                aria-label={expanded ? "收起" : "展开"}
                onClick={e => {
                  e.stopPropagation();
                  setExpanded(v => !v);
                }}
                className="text-ink-3 hover:text-ink-1 grid size-3.5 cursor-pointer place-items-center"
              >
                <ChevronDown
                  size={12}
                  strokeWidth={2}
                  className={cn(
                    "ease-tau-out transition-transform duration-150",
                    !expanded && "-rotate-90"
                  )}
                />
              </button>
            )}
          </span>
          <TypeIcon
            size={15}
            strokeWidth={1.75}
            aria-label={meta.label}
            className={cn("flex-none", isSelected ? "text-accent-text" : "text-ink-2")}
          />
          {isRenaming ? (
            <input
              autoFocus
              value={tempName}
              onChange={e => setTempName(e.target.value)}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setIsRenaming(false);
                e.stopPropagation();
              }}
              placeholder={displayName}
              className="bg-surface text-tau-body border-accent text-ink-1 h-6 min-w-0 flex-1 rounded-[6px] border px-1.5 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate" onDoubleClick={startRename}>
              {displayName}
            </span>
          )}
          {/* 子元素数与「更多」共用一个固定槽位：悬停 / 菜单打开时原位交叉淡入（只改透明度，不改尺寸） */}
          <span className="relative grid size-[22px] flex-none place-items-center">
            {childCount > 0 && (
              <span
                className={cn(
                  "text-ink-3 text-tau-micro pointer-events-none absolute tabular-nums group-hover/row:opacity-0",
                  menuOpen && "opacity-0"
                )}
              >
                {childCount}
              </span>
            )}
            <Menu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label="更多"
                  onClick={e => e.stopPropagation()}
                  className={cn(
                    "text-ink-3 hover:bg-press hover:text-ink-1 grid size-[22px] flex-none cursor-pointer place-items-center rounded-[6px] opacity-0 group-hover/row:opacity-100",
                    menuOpen && "opacity-100"
                  )}
                >
                  <Ellipsis size={14} strokeWidth={1.75} />
                </button>
              }
            >
              {menuItems}
            </Menu>
          </span>
        </div>
      </ContextMenu>
      {expanded && hasChildren && (
        <div className="origin-top transform transition-all duration-300 ease-out">
          {(element.children
            ? capService.shouldReverseChildren(element)
              ? [...element.children].reverse()
              : [...element.children]
            : []
          ).map(child => (
            <Node key={child.id} element={child} depth={depth + 1} selectedIds={selectedIds} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Node;
