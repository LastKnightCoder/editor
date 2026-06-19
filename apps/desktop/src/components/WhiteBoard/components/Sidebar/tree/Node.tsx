import React, { useMemo, useState, useCallback } from "react";
import { Dropdown, MenuProps, App } from "antd";
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  UpOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from "@ant-design/icons";
import {
  Board,
  BoardElement,
  MindNodeElement,
  Operation,
} from "../../../types";
import { useBoard } from "../../../hooks";
import classNames from "classnames";
import { useElementDnD, DragPosition } from "./useElementDnD";
import {
  PathUtil,
  BoardUtil,
  MindUtil,
  getLayerOrderActionState,
  executeLayerOrderAction,
} from "../../../utils";
import { ViewPortTransforms } from "../../../transforms/ViewPortTransforms";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
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
  collapsed?: boolean;
}

const INDENT = 1; // 使用 em 单位，根据用户偏好

// 拖拽指示器样式常量
const TOP_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-0",
  "before:right-0",
  "before:-top-[2px]",
  "before:h-[2px]",
  "before:bg-gradient-to-r",
  "before:from-violet-500",
  "before:to-purple-500",
  "before:rounded-full",
].join(" ");

const BOTTOM_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-0",
  "before:right-0",
  "before:-bottom-[2px]",
  "before:h-[2px]",
  "before:bg-gradient-to-r",
  "before:from-violet-500",
  "before:to-purple-500",
  "before:rounded-full",
].join(" ");

const INSIDE_DROP_INDICATOR_CLASS = [
  "ring-2",
  "ring-violet-500/50",
  "bg-violet-50/50",
  "dark:bg-violet-900/20",
].join(" ");

const COLOR_CLASS_MAP: Record<
  string,
  {
    text: string;
    surface: string;
    rounded: string;
    hover: string;
    gradV: string;
    gradH: string;
    selected: string;
    input: string;
  }
> = {
  emerald: {
    text: "wb-node-text-emerald",
    surface: "wb-node-surface-emerald",
    rounded: "wb-node-rounded-emerald",
    hover: "wb-node-hover-emerald",
    gradV: "wb-node-grad-v-emerald",
    gradH: "wb-node-grad-h-emerald",
    selected: "wb-node-selected-emerald",
    input: "wb-node-input-emerald",
  },
  blue: {
    text: "wb-node-text-blue",
    surface: "wb-node-surface-blue",
    rounded: "wb-node-rounded-blue",
    hover: "wb-node-hover-blue",
    gradV: "wb-node-grad-v-blue",
    gradH: "wb-node-grad-h-blue",
    selected: "wb-node-selected-blue",
    input: "wb-node-input-blue",
  },
  purple: {
    text: "wb-node-text-purple",
    surface: "wb-node-surface-purple",
    rounded: "wb-node-rounded-purple",
    hover: "wb-node-hover-purple",
    gradV: "wb-node-grad-v-purple",
    gradH: "wb-node-grad-h-purple",
    selected: "wb-node-selected-purple",
    input: "wb-node-input-purple",
  },
  orange: {
    text: "wb-node-text-orange",
    surface: "wb-node-surface-orange",
    rounded: "wb-node-rounded-orange",
    hover: "wb-node-hover-orange",
    gradV: "wb-node-grad-v-orange",
    gradH: "wb-node-grad-h-orange",
    selected: "wb-node-selected-orange",
    input: "wb-node-input-orange",
  },
  pink: {
    text: "wb-node-text-pink",
    surface: "wb-node-surface-pink",
    rounded: "wb-node-rounded-pink",
    hover: "wb-node-hover-pink",
    gradV: "wb-node-grad-v-pink",
    gradH: "wb-node-grad-h-pink",
    selected: "wb-node-selected-pink",
    input: "wb-node-input-pink",
  },
  rose: {
    text: "wb-node-text-rose",
    surface: "wb-node-surface-rose",
    rounded: "wb-node-rounded-rose",
    hover: "wb-node-hover-rose",
    gradV: "wb-node-grad-v-rose",
    gradH: "wb-node-grad-h-rose",
    selected: "wb-node-selected-rose",
    input: "wb-node-input-rose",
  },
  cyan: {
    text: "wb-node-text-cyan",
    surface: "wb-node-surface-cyan",
    rounded: "wb-node-rounded-cyan",
    hover: "wb-node-hover-cyan",
    gradV: "wb-node-grad-v-cyan",
    gradH: "wb-node-grad-h-cyan",
    selected: "wb-node-selected-cyan",
    input: "wb-node-input-cyan",
  },
  amber: {
    text: "wb-node-text-amber",
    surface: "wb-node-surface-amber",
    rounded: "wb-node-rounded-amber",
    hover: "wb-node-hover-amber",
    gradV: "wb-node-grad-v-amber",
    gradH: "wb-node-grad-h-amber",
    selected: "wb-node-selected-amber",
    input: "wb-node-input-amber",
  },
  indigo: {
    text: "wb-node-text-indigo",
    surface: "wb-node-surface-indigo",
    rounded: "wb-node-rounded-indigo",
    hover: "wb-node-hover-indigo",
    gradV: "wb-node-grad-v-indigo",
    gradH: "wb-node-grad-h-indigo",
    selected: "wb-node-selected-indigo",
    input: "wb-node-input-indigo",
  },
  gray: {
    text: "wb-node-text-gray",
    surface: "wb-node-surface-gray",
    rounded: "wb-node-rounded-gray",
    hover: "wb-node-hover-gray",
    gradV: "wb-node-grad-v-gray",
    gradH: "wb-node-grad-h-gray",
    selected: "wb-node-selected-gray",
    input: "wb-node-input-gray",
  },
  teal: {
    text: "wb-node-text-teal",
    surface: "wb-node-surface-teal",
    rounded: "wb-node-rounded-teal",
    hover: "wb-node-hover-teal",
    gradV: "wb-node-grad-v-teal",
    gradH: "wb-node-grad-h-teal",
    selected: "wb-node-selected-teal",
    input: "wb-node-input-teal",
  },
};

const Node: React.FC<NodeProps> = ({
  element,
  depth,
  selectedIds,
  collapsed,
}) => {
  const board = useBoard();
  const [expanded, setExpanded] = useState(!collapsed);
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState<string>(element.name ?? "");

  const { modal } = App.useApp();

  const hasChildren =
    Array.isArray(element.children) && element.children.length > 0;
  const isSelected = selectedIds.has(element.id);

  const displayName = element.name ?? element.type;
  const capService = board.capabilityService;

  const elementPath = useMemo(
    () => PathUtil.getPathByElement(board, element) ?? [],
    [board, element],
  );
  const parentPath = useMemo(
    () => (elementPath.length > 0 ? elementPath.slice(0, -1) : null),
    [elementPath],
  );
  // 使用能力查询判断是否是容器
  const isContainer = capService.isContainer(element);
  const { drag, drop, dropContainerRef, isOver, canDrop, dragPosition } =
    useElementDnD(
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
                ? (PathUtil.getElementByPath(
                    board,
                    dropParentPath,
                  ) as BoardElement | null)
                : null;
            return canDropElementIntoParent(
              board as Board,
              targetParent,
              dragEl,
            );
          }
          if (!isContainer) return false;
          // 使用能力查询检查容器是否可以包含拖拽元素
          return capService.canContain(element, dragEl);
        },
        onDrop: async (dragItem, dropItem, position) => {
          // 使用实时路径，避免拖拽开始与放下之间的路径变化
          const dragElCurrent = BoardUtil.getElementById(
            board,
            dragItem.elementId,
          );
          const fromPath =
            (dragElCurrent &&
              PathUtil.getPathByElement(board, dragElCurrent)) ||
            dragItem.path;
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
                dragEl as unknown as MindNodeElement,
              );
              sourceMindRootId = sourceRoot?.id ?? null;
            }

            // 使用容器协议准备元素（设置 resizable、autoHeight 等属性）
            const preparedElement = await capService.prepareElementForInsertion(
              element,
              dragEl,
            );

            // 关键修复：异步操作后重新获取最新的容器状态
            // 因为在 await 期间，Board 状态可能已经改变
            const latestElement = BoardUtil.getElementById(board, element.id);
            if (!latestElement) {
              console.warn(
                "Target container not found after prepareElementForInsertion",
              );
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
            const latestTargetPath =
              PathUtil.getPathByElement(board, latestElement) || elementPath;
            const newPath = [
              ...latestTargetPath,
              latestElement.children?.length ?? 0,
            ];
            pendingOps.push({ type: "move_node", path: fromPath, newPath });
            const previewChildren = simulateChildrenAfterOps(board, pendingOps);
            let layoutOpsCount = 0;

            // 对于需要带子元素移动的容器，需要调整大小
            if (capService.shouldMoveWithChildren(element)) {
              const resizeOp = buildFrameResizeOp(
                board as Board,
                previewChildren,
                element.id,
                elementPath,
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
                sourceMindRootId,
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
                (sourceContainer as BoardElement).id,
              );
              if (latestSourceContainer) {
                capService.notifyChildRemoved(latestSourceContainer, dragEl);
              }
            }
            // 通知目标容器有新元素插入
            const latestTargetContainer = BoardUtil.getElementById(
              board,
              element.id,
            );
            if (latestTargetContainer) {
              capService.notifyChildInserted(latestTargetContainer);
            }

            if (dragRequiresRelayout && layoutOpsCount === 0) {
              MindUtil.relayoutAffectedRootsAfterMindMove(
                board as Board,
                dragItem.elementId,
                sourceMindRootId,
              );
            }
            return;
          }

          // Top/Bottom: 插到目标节点父级；考虑反向渲染
          const latestDropTarget = BoardUtil.getElementById(
            board,
            dropItem.elementId,
          );
          const latestDropPath =
            (latestDropTarget &&
              PathUtil.getPathByElement(board, latestDropTarget)) ||
            dropItem.path;
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
              ? (PathUtil.getElementByPath(
                  board,
                  parent,
                ) as BoardElement | null)
              : null;

          // Top/Bottom 会插到目标节点的父级，必须同时满足父级容器的包含规则。
          if (
            dragEl2 &&
            !canDropElementIntoParent(board as Board, targetParentEl, dragEl2)
          ) {
            return;
          }
          // 根据父级列表的展示顺序决定插入索引：
          // - 使用能力查询判断子元素渲染顺序
          // 在移动前记录源 mind 根节点，移动后获取最新 root 并重新布局
          let sourceMindRootIdForReorder: string | null = null;
          const dragRequiresRelayout2 = dragEl2
            ? capService.requiresRelayout(dragEl2)
            : false;
          if (dragRequiresRelayout2 && dragEl2) {
            const sourceRoot = MindUtil.getRoot(
              board as Board,
              dragEl2 as MindNodeElement,
            );
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
          const pendingOps: Operation[] = [
            { type: "move_node", path: fromPath, newPath },
          ];
          let layoutOpsCount = 0;
          if (dragEl2 && capService.requiresRelayout(dragEl2)) {
            const previewChildren = simulateChildrenAfterOps(board, pendingOps);
            const layoutOps = collectMindLayoutOpsFromPreview(
              board as Board,
              previewChildren,
              dragItem.elementId,
              sourceMindRootIdForReorder,
            );
            layoutOpsCount = layoutOps.length;
            pendingOps.push(...layoutOps);
          }
          board.apply(pendingOps, true);

          // 触发容器协议回调
          // 判断是否从容器移出
          const isMovingOutOfContainer =
            sourceContainer2 !== null &&
            (!targetParentEl ||
              (sourceContainer2 as BoardElement).id !== targetParentEl.id);
          // 判断是否移入新容器
          const isMovingIntoContainer =
            targetParentEl !== null &&
            capService.isContainer(targetParentEl) &&
            (sourceContainer2 === null ||
              (sourceContainer2 as BoardElement).id !== targetParentEl.id);

          if (isMovingOutOfContainer && dragEl2 && sourceContainer2 !== null) {
            const latestSourceContainer = BoardUtil.getElementById(
              board,
              (sourceContainer2 as BoardElement).id,
            );
            if (latestSourceContainer) {
              capService.notifyChildRemoved(latestSourceContainer, dragEl2);
            }
          }
          if (isMovingIntoContainer && targetParentEl !== null) {
            const latestTargetContainer = BoardUtil.getElementById(
              board,
              (targetParentEl as BoardElement).id,
            );
            if (latestTargetContainer) {
              capService.notifyChildInserted(latestTargetContainer);
            }
          }

          if (
            dragEl2 &&
            capService.requiresRelayout(dragEl2) &&
            layoutOpsCount === 0
          ) {
            MindUtil.relayoutAffectedRootsAfterMindMove(
              board as Board,
              dragItem.elementId,
              sourceMindRootIdForReorder,
            );
          }
        },
      },
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
        true,
      );
      // 居中显示
      ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
    },
    [board, element],
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
    if (!path) return;
    board.apply(
      {
        type: "set_node",
        path,
        properties: { name: element.name },
        newProperties: { name: newName },
      },
      true,
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
    [board, contextMenuTargets],
  );

  const onMenuClick = useCallback<NonNullable<MenuProps["onClick"]>>(
    ({ key }) => {
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
        modal.confirm({
          title: "删除元素",
          content: "确定要删除该元素吗？",
          okButtonProps: {
            danger: true,
          },
          onOk: () => {
            // 需要布局的元素需要特殊处理：非根节点删除后需对其根节点重新布局
            if (capService.requiresRelayout(element)) {
              const mindElement = element as MindNodeElement;
              const root = MindUtil.getRoot(board as Board, mindElement);
              if (!root) return;
              if (root.id === mindElement.id) {
                // 删除根节点：直接 remove
                const currentPath = PathUtil.getPathByElement(board, element);
                if (!currentPath) return;
                board.apply(
                  { type: "remove_node", path: currentPath, node: element },
                  true,
                );
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
            const pendingOps: Operation[] = [
              { type: "remove_node", path: currentPath, node: element },
            ];
            const previewChildren = simulateChildrenAfterOps(board, pendingOps);
            if (parentPath && parentPath.length > 0) {
              const parentEl = PathUtil.getElementByPath(
                board,
                parentPath,
              ) as BoardElement | null;
              if (parentEl?.type === "frame") {
                const resizeOp = buildFrameResizeOp(
                  board as Board,
                  previewChildren,
                  parentEl.id,
                  parentPath,
                );
                if (resizeOp) {
                  pendingOps.push(resizeOp);
                }
              }
            }
            board.apply(pendingOps, true);
          },
        });
        return;
      }
    },
    [board, element, parentPath, startRename, contextMenuTargets, capService],
  );

  const dropdownMenu = useMemo<MenuProps["items"]>(
    () => [
      { key: "rename", label: "重命名", icon: <EditOutlined /> },
      {
        key: "layer-move-up",
        label: "上移一层",
        icon: <UpOutlined />,
        disabled: layerActionState.moveUpDisabled,
      },
      {
        key: "layer-move-down",
        label: "下移一层",
        icon: <DownOutlined />,
        disabled: layerActionState.moveDownDisabled,
      },
      {
        key: "layer-move-top",
        label: "移至顶层",
        icon: <VerticalAlignTopOutlined />,
        disabled: layerActionState.moveTopDisabled,
      },
      {
        key: "layer-move-bottom",
        label: "移至底层",
        icon: <VerticalAlignBottomOutlined />,
        disabled: layerActionState.moveBottomDisabled,
      },
      { type: "divider" as const },
      { key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true },
    ],
    [layerActionState],
  );

  // 使用能力查询获取颜色主题
  const color = useMemo(
    () => capService.getColorTheme(element),
    [element, capService],
  );

  const colorClasses = useMemo(
    () => COLOR_CLASS_MAP[color] ?? COLOR_CLASS_MAP.gray,
    [color],
  );

  return (
    <div className="relative">
      <Dropdown
        menu={{ items: dropdownMenu, onClick: onMenuClick }}
        trigger={["contextMenu"]}
        getPopupContainer={() => document.body}
      >
        <div
          onClick={onClick}
          className={classNames(
            "group select-none relative transition-all duration-150 ease-out",
            "rounded-md mx-2",
            colorClasses.hover,
            isSelected && colorClasses.selected,
            {
              "cursor-not-allowed": isOver && !canDrop,
              "cursor-pointer": !isOver || canDrop,
              [TOP_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === DragPosition.Top,
              [BOTTOM_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === DragPosition.Bottom,
              [INSIDE_DROP_INDICATOR_CLASS]:
                isOver &&
                canDrop &&
                dragPosition === DragPosition.Inside &&
                isContainer,
            },
          )}
          style={{
            paddingLeft: `${INDENT * depth + 0.45}em`,
            marginLeft: `${0.15 * depth}em`,
          }}
          ref={(el) => {
            if (!el) return;
            // 组合连接器：先 drop 再 drag，避免覆盖
            drop(el);
            drag(el);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dropContainerRef as any).current = el;
          }}
        >
          <div className="flex items-center gap-2 py-1.5 px-2">
            {hasChildren ? (
              <button
                type="button"
                aria-label={expanded ? "收起" : "展开"}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className={classNames(
                  "flex items-center justify-center w-5 h-5 rounded transition-colors duration-150",
                  "hover:bg-item-hover",
                  "text-text-secondary hover:text-text-primary",
                )}
              >
                {expanded ? (
                  <HiChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <HiChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <div className="w-5 h-5 flex items-center justify-center">
                <div
                  className={classNames(
                    "w-1.5 h-1.5 rounded-full",
                    colorClasses.rounded,
                  )}
                />
              </div>
            )}
            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
              {isRenaming ? (
                <input
                  autoFocus
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setIsRenaming(false);
                    e.stopPropagation();
                  }}
                  className={classNames(
                    "min-w-0 flex-1 bg-transparent outline-none border-b focus:border-bottom-line text-sm text-text-primary",
                    colorClasses.input,
                  )}
                />
              ) : (
                <span className="truncate text-text-primary font-medium text-sm leading-relaxed">
                  {displayName}
                </span>
              )}
              <span
                className={classNames(
                  "shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-all duration-200",
                  "border backdrop-blur-sm",
                  colorClasses.surface,
                  colorClasses.text,
                )}
              >
                {element.type}
              </span>
            </div>
          </div>
        </div>
      </Dropdown>
      {expanded && hasChildren && (
        <div className="transition-all duration-300 ease-out transform origin-top">
          {(element.children
            ? capService.shouldReverseChildren(element)
              ? [...element.children].reverse()
              : [...element.children]
            : []
          ).map((child) => (
            <Node
              key={child.id}
              element={child}
              depth={depth + 1}
              selectedIds={selectedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Node;
