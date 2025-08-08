import React, { useMemo, useState, useCallback } from "react";
import { BoardElement } from "../../../types";
import { useBoard } from "../../../hooks";
import classNames from "classnames";
import { useElementDnD, DragPosition } from "./useElementDnD";
import { PathUtil, BoardUtil } from "../../../utils";
import { canNest } from "../../../utils/Constraints";
import { ViewPortTransforms } from "../../../transforms/ViewPortTransforms";

interface NodeProps {
  element: BoardElement;
  depth: number;
  selectedIds: Set<string>;
  collapsed?: boolean;
}

const INDENT = 12;

const Node: React.FC<NodeProps> = ({
  element,
  depth,
  selectedIds,
  collapsed,
}) => {
  const board = useBoard();
  const [expanded, setExpanded] = useState(!collapsed);

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
  const { drop, dropContainerRef, isOver, canDrop, dragPosition } =
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

  return (
    <div>
      <div
        onClick={onClick}
        className={classNames(
          "cursor-pointer select-none px-2 py-1 text-sm",
          "hover:bg-item-hover",
          isSelected && "bg-sidebar-active",
          isContainer &&
            isOver &&
            canDrop &&
            "outline outline-1 outline-ui-outline",
        )}
        style={{ paddingLeft: `${INDENT * depth + 8}px` }}
        ref={(el) => {
          if (isContainer) {
            drop(el);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dropContainerRef as any).current = el;
          }
        }}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              aria-label={expanded ? "收起" : "展开"}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="text-text-secondary hover:text-text-primary"
            >
              {expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <span className="truncate text-text-primary font-medium">
            {displayName}
          </span>
          <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-md bg-bg-tertiary/60 text-text-secondary">
            {element.type}
          </span>
        </div>
        {isContainer && isOver && canDrop && (
          <div className="relative h-0">
            {dragPosition === DragPosition.Top && (
              <div className="absolute left-0 right-0 -top-0.5 h-0.5 bg-bottom-line" />
            )}
            {dragPosition === DragPosition.Bottom && (
              <div className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-bottom-line" />
            )}
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {element.children!.map((child) => (
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
