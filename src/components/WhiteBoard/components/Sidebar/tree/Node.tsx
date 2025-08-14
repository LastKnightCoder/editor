import React, { useMemo, useState, useCallback } from "react";
import { Dropdown, MenuProps, App } from "antd";
import {
  Board,
  BoardElement,
  FrameElement,
  MindNodeElement,
} from "../../../types";
import { useBoard } from "../../../hooks";
import classNames from "classnames";
import { useElementDnD, DragPosition } from "./useElementDnD";
import { PathUtil, BoardUtil, FrameUtil, MindUtil } from "../../../utils";
import { canNest } from "../../../utils/Constraints";
import { ViewPortTransforms } from "../../../transforms/ViewPortTransforms";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";

interface NodeProps {
  element: BoardElement;
  depth: number;
  selectedIds: Set<string>;
  collapsed?: boolean;
}

const INDENT = 1; // 使用 em 单位，根据用户偏好
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

  const elementPath = useMemo(
    () => PathUtil.getPathByElement(board, element) ?? [],
    [board, element],
  );
  const parentPath = useMemo(
    () => (elementPath.length > 0 ? elementPath.slice(0, -1) : null),
    [elementPath],
  );
  const isContainer = element.type === "frame" || element.type === "mind-node";
  const { drag, drop, dropContainerRef, isOver, canDrop, dragPosition } =
    useElementDnD(
      { elementId: element.id, path: elementPath, parentPath },
      {
        canDropExtra: (dragItem, _dropItem, position) => {
          // Inside 放置需要容器校验；Top/Bottom 用于同父级重排，允许
          if (position !== DragPosition.Inside) return true;
          if (!isContainer) return false;
          const dragEl = BoardUtil.getElementById(board, dragItem.elementId);
          if (!dragEl) return false;
          if (element.type === "mind-node") {
            return dragEl.type === "mind-node";
          }
          if (element.type === "frame") {
            return canNest(element, dragEl);
          }
          return false;
        },
        onDrop: (dragItem, dropItem, position) => {
          const fromPath = dragItem.path;
          if (position === DragPosition.Inside) {
            if (!isContainer) return;
            const dragEl = BoardUtil.getElementById(board, dragItem.elementId);
            if (!dragEl) return;
            if (element.type === "mind-node" && dragEl.type !== "mind-node")
              return;
            if (element.type === "frame" && !canNest(element, dragEl)) return;

            // 记录源 mind 根节点（在移动之前）
            let sourceMindRootId: string | null = null;
            if (dragEl.type === "mind-node") {
              const sourceRoot = MindUtil.getRoot(
                board as Board,
                dragEl as unknown as MindNodeElement,
              );
              sourceMindRootId = sourceRoot?.id ?? null;
            }

            const newPath = [...elementPath, element.children?.length ?? 0];
            board.apply({ type: "move_node", path: fromPath, newPath }, true);
            // 放入 frame 后，自适应调整 frame 尺寸
            if (element.type === "frame") {
              const updatedFrame = PathUtil.getElementByPath(
                board,
                elementPath,
              ) as FrameElement;
              if (updatedFrame) {
                FrameUtil.resizeToFitChildren(board, updatedFrame);
              }
            }
            // 放入 mind-node 后，需要重新拿到 root，进行 layout
            if (element.type === "mind-node") {
              const updatedNode = BoardUtil.getElementById(board, element.id);
              if (updatedNode?.type === "mind-node") {
                const root = MindUtil.getRoot(
                  board as Board,
                  updatedNode as MindNodeElement,
                );
                if (root) {
                  const laidOut = MindUtil.layout(root);
                  // 将 layout 后的根节点写回
                  const rootPath = PathUtil.getPathByElement(board, root)!;
                  board.apply(
                    {
                      type: "set_node",
                      path: rootPath,
                      properties: root,
                      newProperties: laidOut,
                    },
                    true,
                  );
                }
              }

              // 同时对源 mind 根节点也进行重布局
              if (sourceMindRootId) {
                const latestSourceRoot = BoardUtil.getElementById(
                  board,
                  sourceMindRootId,
                ) as MindNodeElement | null;
                if (latestSourceRoot) {
                  const relaid = MindUtil.layout(latestSourceRoot);
                  const sourceRootPath = PathUtil.getPathByElement(
                    board,
                    latestSourceRoot,
                  )!;
                  board.apply(
                    {
                      type: "set_node",
                      path: sourceRootPath,
                      properties: latestSourceRoot,
                      newProperties: relaid,
                    },
                    true,
                  );
                }
              }
            }
            return;
          }

          // Top/Bottom: 插到目标节点父级；考虑反向渲染
          const dropIndex = dropItem.path[dropItem.path.length - 1];
          const parent = dropItem.parentPath ?? [];
          // 若为 mind-node 的同级拖拽，仅允许当父级为 mind-node
          if (parent.length > 0) {
            const parentEl = PathUtil.getElementByPath(
              board,
              parent,
            ) as BoardElement | null;
            const dragEl = BoardUtil.getElementById(board, dragItem.elementId);
            if (
              dragEl?.type === "mind-node" &&
              parentEl?.type !== "mind-node"
            ) {
              return; // 阻止 mind-node 被插到非 mind-node 的层级
            }
          }
          // 根据父级列表的展示顺序决定插入索引：
          // - 顶层和非 mind-node 子列表为逆序（Top 表示插到其后）
          // - mind-node 子列表为正序（Top 表示插到其前）
          // 在移动前记录源 mind 根节点，移动后获取最新 root 并重新布局
          let sourceMindRootIdForReorder: string | null = null;
          const dragEl2 = BoardUtil.getElementById(board, dragItem.elementId);
          if (dragEl2?.type === "mind-node") {
            const sourceRoot = MindUtil.getRoot(
              board as Board,
              dragEl2 as MindNodeElement,
            );
            sourceMindRootIdForReorder = sourceRoot?.id ?? null;
          }
          let isReversed = true; // 默认按当前 UI 的逆序渲染
          if (parent.length > 0) {
            const parentEl2 = PathUtil.getElementByPath(
              board,
              parent,
            ) as BoardElement | null;
            isReversed = parentEl2 ? parentEl2.type !== "mind-node" : true;
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
          board.apply({ type: "move_node", path: fromPath, newPath }, true);

          // 移动后对 mind-node 的 root 进行重新布局（统一调用工具方法）
          if (dragEl2?.type === "mind-node") {
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

  const onMenuClick = useCallback<NonNullable<MenuProps["onClick"]>>(
    ({ key }) => {
      if (key === "rename") {
        startRename();
        return;
      }
      const path = elementPath;
      if (!path) return;
      if (key === "toTop") {
        // 记录源 mind root（若当前元素为 mind-node）
        let sourceMindRootId: string | null = null;
        if (element.type === "mind-node") {
          const sourceRoot = MindUtil.getRoot(
            board as Board,
            element as MindNodeElement,
          );
          sourceMindRootId = sourceRoot?.id ?? null;
        }

        const parent = PathUtil.getParentByPath(board, path);
        const isTopLevel = !parent || (parent as any) === board;
        const parentChildren = isTopLevel
          ? board.children
          : ((parent as BoardElement).children ?? []);
        const total = parentChildren.length;
        // 顶层与非 mind-node 子列表为逆序；mind-node 子列表为正序
        const isReversed = isTopLevel
          ? true
          : (parent as BoardElement).type !== "mind-node";
        const targetIndex = isReversed ? total : 0;
        const newPath = [...path.slice(0, -1), targetIndex];
        board.apply({ type: "move_node", path, newPath }, true);

        // 移动后重新布局目标 root 与旧 root（获取最新 root）
        if (element.type === "mind-node") {
          MindUtil.relayoutAffectedRootsAfterMindMove(
            board as Board,
            element.id,
            sourceMindRootId,
          );
        }
        return;
      }
      if (key === "toBottom") {
        // 记录源 mind root（若当前元素为 mind-node）
        let sourceMindRootId: string | null = null;
        if (element.type === "mind-node") {
          const sourceRoot = MindUtil.getRoot(
            board as Board,
            element as MindNodeElement,
          );
          sourceMindRootId = sourceRoot?.id ?? null;
        }

        const parent = PathUtil.getParentByPath(board, path);
        const isTopLevel = !parent || (parent as any) === board;
        const parentChildren = isTopLevel
          ? board.children
          : ((parent as BoardElement).children ?? []);
        const total = parentChildren.length;
        const isReversed = isTopLevel
          ? true
          : (parent as BoardElement).type !== "mind-node";
        const targetIndex = isReversed ? 0 : total;
        const newPath = [...path.slice(0, -1), targetIndex];
        board.apply({ type: "move_node", path, newPath }, true);

        // 移动后重新布局目标 root 与旧 root（获取最新 root）
        if (element.type === "mind-node") {
          MindUtil.relayoutAffectedRootsAfterMindMove(
            board as Board,
            element.id,
            sourceMindRootId,
          );
        }
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
            // mind-node 需要特殊处理：非根节点删除后需对其根节点重新布局
            if (element.type === "mind-node") {
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
                board.apply(
                  {
                    type: "set_node",
                    path: rootPath,
                    properties: root,
                    newProperties: newRoot,
                  },
                  true,
                );
              }
              return;
            }
            // 其他类型：直接删除
            const currentPath = PathUtil.getPathByElement(board, element);
            if (!currentPath) return;
            board.apply(
              { type: "remove_node", path: currentPath, node: element },
              true,
            );
          },
        });
        return;
      }
    },
    [board, element, elementPath, startRename],
  );

  const dropdownMenu = useMemo<MenuProps["items"]>(
    () => [
      { key: "rename", label: "重命名" },
      { key: "toTop", label: "移至顶层" },
      { key: "toBottom", label: "移至底层" },
      { type: "divider" as const },
      { key: "delete", label: "删除", danger: true },
    ],
    [],
  );

  const color = useMemo(() => {
    const getColor = (type: string) => {
      switch (type) {
        case "richtext":
          return "emerald";
        case "card":
          return "blue";
        case "frame":
          return "purple";
        case "mind-node":
          return "orange";
        case "image":
          return "pink";
        case "video":
          return "rose";
        case "webview":
          return "cyan";
        case "geometry":
          return "amber";
        case "arrow":
          return "indigo";
        default:
          return "gray";
      }
    };

    return getColor(element.type);
  }, [element.type]);

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
            "group cursor-pointer select-none relative transition-all duration-150 ease-out",
            "rounded-md mx-2",
            colorClasses.hover,
            isSelected && colorClasses.selected,
            isContainer &&
              isOver &&
              canDrop &&
              "ring-2 ring-violet-500/50 bg-violet-50/50 dark:bg-violet-900/20",
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
                  "flex-shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-all duration-200",
                  "border backdrop-blur-sm",
                  colorClasses.surface,
                  colorClasses.text,
                )}
              >
                {element.type}
              </span>
            </div>
          </div>

          {isOver && canDrop && (
            <div className="absolute inset-0 pointer-events-none rounded-xl">
              {dragPosition === DragPosition.Top && (
                <div className="absolute left-2 right-2 -top-1 h-[1px] bg-gradient-to-r from-violet-500 to-purple-500 rounded-full shadow-lg shadow-violet-500/50" />
              )}
              {dragPosition === DragPosition.Bottom && (
                <div className="absolute left-2 right-2 -bottom-1 h-[1px] bg-gradient-to-r from-violet-500 to-purple-500 rounded-full shadow-lg shadow-violet-500/50" />
              )}
              {dragPosition === DragPosition.Inside && isContainer && (
                <div className="absolute inset-0 rounded-xl ring-[2px] ring-violet-500/40" />
              )}
            </div>
          )}
        </div>
      </Dropdown>
      {expanded && hasChildren && (
        <div className="transition-all duration-300 ease-out transform origin-top">
          {(element.children
            ? element.type === "mind-node"
              ? [...element.children]
              : [...element.children].reverse()
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
