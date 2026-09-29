import { useMemo, useCallback } from "react";
import { Editor, NodeEntry, Path, Element, Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
  useSlateSelection,
} from "slate-react";
import { If } from "@tau/shared";
import { cn } from "@tau/ui";
import { Trash2 } from "lucide-react";
import { MdDragIndicator } from "react-icons/md";

import { isLastChild } from "../../../../utils";
import {
  getColumnWidths,
  calcWidthsAfterDelete,
  updateColumnWidths,
} from "../../../../utils/multi-columns-layout";

import { MultiColumnContainerElement, MultiColumnItemElement } from "../../../types";
import useColumnDragAndDrop from "../../hooks/useColumnDragAndDrop";
import useColumnEdgeDrop from "../../hooks/useColumnEdgeDrop";
import { useColumnWidthsContext } from "../../context/ColumnWidthsContext";
import { dimWhileDragging } from "../../../../components/BlockDrag";

// gap 值（与 CSS 中 MultiColumnsContainer .container 的 gap 保持一致）
// 如需修改，请同步更新 MultiColumnsContainer/index.tsx 中容器的 gap-[0.625em]
const GAP_EM = 0.625;

interface IMultiColumnItemProps {
  attributes: RenderElementProps["attributes"];
  element: MultiColumnItemElement;
  children: RenderElementProps["children"];
}

// 边缘放置区域组件
const EdgeDropZone = ({
  position,
  columnIndex,
  containerPath,
}: {
  position: "left" | "right";
  columnIndex: number;
  containerPath: Path;
}) => {
  const { drop, isActive, isDragging } = useColumnEdgeDrop({
    position,
    columnIndex,
    containerPath,
  });

  return (
    <div
      ref={node => {
        drop(node);
      }}
      contentEditable={false}
      className={cn(
        "pointer-events-none absolute bottom-0 top-0 z-[15] w-[40px]",
        position === "left" ? "left-0" : "right-0",
        isActive &&
          "before:absolute before:bottom-0 before:top-0 before:w-[3px] before:bg-[var(--ed-accent-text)] before:content-['']",
        isActive &&
          (position === "left"
            ? "bg-[linear-gradient(to_right,var(--ed-accent-soft),transparent)] before:left-0"
            : "bg-[linear-gradient(to_left,var(--ed-accent-soft),transparent)] before:right-0"),
        isDragging && "pointer-events-auto"
      )}
    />
  );
};

const MultiColumnItem = (props: IMultiColumnItemProps) => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const selection = useSlateSelection();
  const { previewWidths } = useColumnWidthsContext();

  // 列排序拖拽
  const { drag, drop, isDragging, canDrop, isOverCurrent, isBefore } = useColumnDragAndDrop({
    element,
  });

  const isActive = useMemo(() => {
    const [columnItem] = Editor.nodes(editor, {
      match: n => n.type === "multi-column-item",
    });
    if (!columnItem) {
      return false;
    }
    const [, path] = columnItem as NodeEntry<MultiColumnContainerElement>;
    return Path.equals(ReactEditor.findPath(editor, element), path);
  }, [editor, selection, element]);

  const isLast = useMemo(() => {
    return isLastChild(editor, element);
  }, [editor, element]);

  // 计算列索引、总列数和列宽（每次渲染直接计算，避免陈旧值）
  const { columnIndex, totalColumns, columnWidth, containerPath } = (() => {
    try {
      const path = ReactEditor.findPath(editor, element);
      const columnIndex = path[path.length - 1];

      // 获取父容器
      const parentPath = Path.parent(path);
      const [parentNode] = Editor.node(editor, parentPath);

      if (!Element.isElement(parentNode)) {
        return {
          columnIndex: 0,
          totalColumns: 1,
          columnWidth: 100,
          containerPath: [],
        };
      }

      const totalColumns = parentNode.children.length;
      const container = parentNode as MultiColumnContainerElement;

      // 优先使用预览宽度（拖拽调整时），否则使用保存的宽度或默认平均分配
      let columnWidth: number;
      if (previewWidths && previewWidths.length === totalColumns) {
        columnWidth = previewWidths[columnIndex];
      } else if (container.columnWidths && container.columnWidths.length === totalColumns) {
        columnWidth = container.columnWidths[columnIndex];
      } else {
        columnWidth = 100 / totalColumns;
      }

      return {
        columnIndex,
        totalColumns,
        columnWidth,
        containerPath: parentPath,
      };
    } catch {
      return {
        columnIndex: 0,
        totalColumns: 1,
        columnWidth: 100,
        containerPath: [],
      };
    }
  })();

  // 删除列时同步更新 columnWidths
  const onDelete = useCallback(() => {
    try {
      const path = ReactEditor.findPath(editor, element);
      const currentColumnIndex = path[path.length - 1]; // 使用当前路径计算索引，避免陈旧值
      const parentPath = Path.parent(path);
      const [parentNode] = Editor.node(editor, parentPath);
      const container = parentNode as MultiColumnContainerElement;

      // 获取当前列宽并计算删除后的列宽
      const currentWidths = getColumnWidths(container);
      const newWidths = calcWidthsAfterDelete(currentWidths, currentColumnIndex);

      // 使用 Slate 的 Editor.withoutNormalizing 确保原子操作
      Editor.withoutNormalizing(editor, () => {
        // 先删除列节点
        Transforms.removeNodes(editor, { at: path });

        // 如果还有列，更新列宽
        if (newWidths.length > 0) {
          updateColumnWidths(editor, parentPath, newWidths);
        }
      });
    } catch (e) {
      console.error("Failed to delete column:", e);
    }
  }, [editor, element]);

  // 计算样式（考虑 gap）
  const containerStyle = useMemo(() => {
    if (totalColumns > 1) {
      // 使用 calc() 扣除 gap 的影响
      // 总 gap = (totalColumns - 1) * GAP_EM
      // 每列分摊的 gap = ((totalColumns - 1) * GAP_EM) / totalColumns
      const gapPerColumn = ((totalColumns - 1) * GAP_EM) / totalColumns;
      return {
        flex: `0 0 calc(${columnWidth}% - ${gapPerColumn}em)`,
        maxWidth: `calc(${columnWidth}% - ${gapPerColumn}em)`,
      };
    }
    return { flex: "1 1 100%" };
  }, [columnWidth, totalColumns]);

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={cn(
        "relative min-w-0 flex-auto overflow-visible p-[20px]",
        // 悬停只点亮本列的直接子元素：列里可能嵌套分栏，用子代组合器而非 group，避免嵌套列一起亮
        "[&:hover>[data-column-indicator]]:opacity-80",
        "[&:hover>[data-column-actions]]:pointer-events-auto [&:hover>[data-column-actions]]:opacity-100",
        !isLast &&
          "after:absolute after:-right-[5px] after:top-[0.625em] after:h-[calc(100%-0.625em)] after:w-px after:bg-[var(--ed-border)] after:content-['']",
        dimWhileDragging(isDragging),
        isOverCurrent &&
          canDrop &&
          (isBefore
            ? "before:absolute before:bottom-0 before:left-0 before:top-0 before:z-20 before:w-[3px] before:bg-[var(--ed-accent-text)] before:content-['']"
            : "after:absolute after:bottom-0 after:right-0 after:top-0 after:z-20 after:w-[3px] after:bg-[var(--ed-accent-text)] after:content-['']")
      )}
      style={containerStyle}
    >
      {/* 边缘放置区域 */}
      {!readOnly && (
        <>
          <EdgeDropZone position="left" columnIndex={columnIndex} containerPath={containerPath} />
          <EdgeDropZone position="right" columnIndex={columnIndex} containerPath={containerPath} />
        </>
      )}

      {/* 列位置指示器 */}
      <div
        contentEditable={false}
        data-column-indicator
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-10 -translate-y-full select-none rounded-[0_0_4px_0] bg-[var(--ed-accent-text)] px-[6px] py-[2px] text-[12px] leading-[1.1] text-[var(--ed-text-inverse)] opacity-0 transition-opacity duration-200",
          isActive && "opacity-80"
        )}
      >
        {columnIndex + 1}/{totalColumns}
      </div>

      {/* 操作按钮区域 */}
      <If condition={!readOnly}>
        <div
          contentEditable={false}
          data-column-actions
          className={cn(
            "pointer-events-none absolute right-0 top-0 z-20 flex items-center gap-[4px] opacity-0 transition-opacity duration-200",
            isActive && "pointer-events-auto opacity-100"
          )}
        >
          {/* 列拖拽排序手柄 */}
          {totalColumns > 1 && (
            <div
              ref={node => {
                drag(node);
              }}
              className="flex h-[1.75em] w-[1.75em] cursor-grab items-center justify-center rounded-full hover:bg-[var(--ed-bg-hover)] active:cursor-grabbing"
            >
              <MdDragIndicator />
            </div>
          )}
          {/* 删除按钮 */}
          <div
            className="flex h-[1.75em] w-[1.75em] cursor-pointer items-center justify-center rounded-full hover:bg-[var(--ed-bg-hover)]"
            onClick={onDelete}
          >
            <Trash2 size="1em" />
          </div>
        </div>
      </If>

      <div className="relative w-full overflow-visible [word-break:break-word]" {...attributes}>
        {children}
      </div>
    </div>
  );
};

export default MultiColumnItem;
