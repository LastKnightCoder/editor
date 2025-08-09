import React, { useMemo, useState, useCallback } from "react";
// antd Dropdown 版本的节点组件
import { Dropdown, MenuProps } from "antd";
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
  // antd Dropdown 用于右键菜单

  const hasChildren =
    Array.isArray(element.children) && element.children.length > 0;
  const isSelected = selectedIds.has(element.id);

  const displayName = element.name ?? element.type;

  // 拖拽：仅 frame / mind-node 可作为容器接收 drop
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
          // 逆序展示修正：UI Top 表示数据层插入到 dropIndex 之前，
          // 但我们为了避免先删后插引起的索引偏移，选择使用偏移后的目标：
          // Top -> dropIndex + 1, Bottom -> dropIndex
          const insertIndex =
            position === DragPosition.Top ? dropIndex + 1 : dropIndex;
          const newPath = [...parent, insertIndex];
          board.apply({ type: "move_node", path: fromPath, newPath }, true);
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
        const parent = PathUtil.getParentByPath(board, path);
        const total = Array.isArray((parent as BoardElement).children)
          ? (parent as BoardElement).children!.length
          : board.children.length;
        const newPath = [...path.slice(0, -1), total];
        board.apply({ type: "move_node", path, newPath }, true);
        return;
      }
      if (key === "toBottom") {
        const newPath = [...path.slice(0, -1), 0];
        board.apply({ type: "move_node", path, newPath }, true);
        return;
      }
      if (key === "delete") {
        board.apply({ type: "remove_node", path, node: element }, true);
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

  // 根据元素类型确定图标颜色
  const getElementColor = (type: string) => {
    switch (type) {
      case "richtext":
        return "text-emerald-500";
      case "card":
        return "text-blue-500";
      case "frame":
        return "text-purple-500";
      case "mind-node":
        return "text-orange-500";
      default:
        return "text-gray-500";
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "richtext":
        return "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/30";
      case "card":
        return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/30";
      case "frame":
        return "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700/30";
      case "mind-node":
        return "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700/30";
      default:
        return "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700/30";
    }
  };

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
            "rounded-md mx-2 my-0.5",
            "hover:bg-item-hover",
            isSelected && "bg-sidebar-active border-l-2 border-bottom-line",
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
          {depth > 0 && (
            <>
              <div
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-ui-border/20 via-ui-border/40 to-ui-border/20"
                style={{ left: `${0.3 * (depth - 1) + 1.2}em` }}
              />
              <div
                className="absolute top-1/2 w-3 h-px bg-gradient-to-r from-ui-border/40 to-transparent"
                style={{ left: `${0.3 * (depth - 1) + 1.2}em` }}
              />
            </>
          )}

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
                  className={`w-1.5 h-1.5 rounded-full ${getBgColor(element.type)}`}
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
                  }}
                  className="min-w-0 flex-1 bg-transparent outline-none border-b border-ui-border/50 focus:border-bottom-line text-sm text-text-primary"
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
                  getBgColor(element.type),
                  getElementColor(element.type),
                  "group-hover:scale-105",
                )}
              >
                {element.type}
              </span>
            </div>
          </div>

          {isOver && canDrop && (
            <div className="absolute inset-0 pointer-events-none rounded-xl">
              {dragPosition === DragPosition.Top && (
                <div className="absolute left-2 right-2 -top-1 h-1 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full shadow-lg shadow-violet-500/50" />
              )}
              {dragPosition === DragPosition.Bottom && (
                <div className="absolute left-2 right-2 -bottom-1 h-1 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full shadow-lg shadow-violet-500/50" />
              )}
              {dragPosition === DragPosition.Inside && isContainer && (
                <div className="absolute inset-0 rounded-xl ring-2 ring-violet-500/40" />
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
