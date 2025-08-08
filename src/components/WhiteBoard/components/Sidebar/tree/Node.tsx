import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { BoardElement } from "../../../types";
import { useBoard } from "../../../hooks";
import classNames from "classnames";
import { useElementDnD, DragPosition } from "./useElementDnD";
import { PathUtil, BoardUtil } from "../../../utils";
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
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
  }>({ open: false, x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

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
          if (!isContainer) return false;
          // 仅允许 Inside 放置
          if (position !== DragPosition.Inside) return false;
          const dragEl = BoardUtil.getElementById(board, dragItem.elementId);
          if (!dragEl) return false;
          if (element.type === "mind-node") {
            // mind-node 仅接收 mind-node
            return dragEl.type === "mind-node";
          }
          if (element.type === "frame") {
            // frame 仅按 canNest 规则接收
            return canNest(element, dragEl);
          }
          return false;
        },
        onDrop: (dragItem, _dropItem, position) => {
          if (!isContainer || position !== DragPosition.Inside) return;
          const dragEl = BoardUtil.getElementById(board, dragItem.elementId);
          if (!dragEl) return;
          if (element.type === "mind-node" && dragEl.type !== "mind-node")
            return;
          if (element.type === "frame" && !canNest(element, dragEl)) return;
          const fromPath = dragItem.path;
          const newPath = [...elementPath, element.children?.length ?? 0];
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

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // 广播关闭其它菜单，确保同时只出现一个
    window.dispatchEvent(new Event("wb-sidebar-close-menus"));
    // 使用视口坐标，初始直接放在右键位置，后续用真实尺寸再校正
    setContextMenu({ open: true, x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(
    () => setContextMenu((m) => ({ ...m, open: false })),
    [],
  );

  const centerInViewport = useCallback(() => {
    ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
    closeMenu();
  }, [board, element, closeMenu]);

  const startRename = useCallback(() => {
    setTempName(element.name ?? "");
    setIsRenaming(true);
    closeMenu();
  }, [element, closeMenu]);

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

  // 全局关闭：点击/右键/滚动/缩放/广播
  useEffect(() => {
    const close = () =>
      setContextMenu((m) => (m.open ? { ...m, open: false } : m));
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("wb-sidebar-close-menus", close as EventListener);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener(
        "wb-sidebar-close-menus",
        close as EventListener,
      );
    };
  }, []);

  // 打开后根据菜单真实尺寸做一次防溢出修正
  useEffect(() => {
    if (!contextMenu.open || !menuRef.current) return;
    const padding = 8;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (x + rect.width + padding > vw)
      x = Math.max(padding, vw - rect.width - padding);
    if (y + rect.height + padding > vh)
      y = Math.max(padding, vh - rect.height - padding);
    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu((m) => ({ ...m, x, y }));
    }
  }, [contextMenu]);

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
      <div
        onClick={onClick}
        onContextMenu={onContextMenu}
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
          // 节点可拖动
          drag(el);
          // 容器作为放置目标
          if (isContainer) {
            drop(el);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dropContainerRef as any).current = el;
          }
        }}
      >
        {/* 现代化的层级连接线 */}
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
          {/* 展开/收起按钮 */}
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
            <div className="w-6 h-6 flex items-center justify-center">
              <div
                className={`w-2 h-2 rounded-full ${getElementColor(element.type)}/60`}
              />
            </div>
          )}

          {/* 内容区域 */}
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

            {/* 元素类型标签 */}
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

        {/* 拖拽指示器 - 现代化设计 */}
        {isContainer && isOver && canDrop && (
          <div className="absolute inset-0 pointer-events-none rounded-xl">
            {dragPosition === DragPosition.Top && (
              <div className="absolute left-2 right-2 -top-1 h-1 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full shadow-lg shadow-violet-500/50" />
            )}
            {dragPosition === DragPosition.Bottom && (
              <div className="absolute left-2 right-2 -bottom-1 h-1 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full shadow-lg shadow-violet-500/50" />
            )}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu.open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 rounded-lg border border-ui-border bg-surface shadow-lg text-sm min-w-[180px] py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="block w-full text-left px-4 py-2 hover:bg-item-hover text-text-primary"
              onClick={startRename}
            >
              重命名
            </button>
            <button
              className="block w-full text-left px-4 py-2 hover:bg-item-hover text-text-primary"
              onClick={() => {
                // 视觉反转后，“顶层”应移动到父级最后（渲染在最上方）
                const path = elementPath;
                if (!path) return;
                const currentIndex = path[path.length - 1];
                const parent = PathUtil.getParentByPath(board, path);
                const total = Array.isArray((parent as any).children)
                  ? (parent as any).children.length
                  : board.children.length;
                if (currentIndex === total - 1) {
                  closeMenu();
                  return;
                }
                const newPath = [...path.slice(0, -1), total];
                board.apply({ type: "move_node", path, newPath }, true);
                closeMenu();
              }}
            >
              移至顶层
            </button>
            <button
              className="block w-full text-left px-4 py-2 hover:bg-item-hover text-text-primary"
              onClick={() => {
                // 视觉反转后，“底层”应移动到父级最前（渲染在最下方）
                const path = elementPath;
                if (!path) return;
                const currentIndex = path[path.length - 1];
                if (currentIndex === 0) {
                  closeMenu();
                  return;
                }
                const newPath = [...path.slice(0, -1), 0];
                board.apply({ type: "move_node", path, newPath }, true);
                closeMenu();
              }}
            >
              移至底层
            </button>
            <div className="my-1 h-px bg-ui-border/40" />
            <button
              className="block w-full text-left px-4 py-2 hover:bg-item-hover text-red-600"
              onClick={() => {
                const path = elementPath;
                if (!path) return;
                board.apply({ type: "remove_node", path, node: element }, true);
                closeMenu();
              }}
            >
              删除
            </button>
          </div>,
          document.body,
        )}

      {/* 子元素展开动画 */}
      {expanded && hasChildren && (
        <div className="transition-all duration-300 ease-out transform origin-top">
          {element.children?.map((child) => (
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
