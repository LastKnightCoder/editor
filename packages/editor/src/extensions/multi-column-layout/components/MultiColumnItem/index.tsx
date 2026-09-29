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
import { Trash2 } from "lucide-react";
import { MdDragIndicator } from "react-icons/md";

import { isLastChild } from "../../../../utils";
import {
  getColumnWidths,
  calcWidthsAfterDelete,
  updateColumnWidths,
} from "../../../../utils/multi-columns-layout";
import classnames from "classnames";

import { MultiColumnContainerElement, MultiColumnItemElement } from "../../../types";
import useColumnDragAndDrop from "../../hooks/useColumnDragAndDrop";
import useColumnEdgeDrop from "../../hooks/useColumnEdgeDrop";
import { useColumnWidthsContext } from "../../context/ColumnWidthsContext";

import styles from "./index.module.less";

// gap 值（与 CSS 中 MultiColumnsContainer .container 的 gap 保持一致）
// 如需修改，请同步更新 MultiColumnsContainer/index.module.less 中的 gap 值
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
      className={classnames(styles.edgeDropZone, styles[position], {
        [styles.active]: isActive,
        [styles.dragging]: isDragging,
      })}
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
  const { drag, drop, isDragging, canDrag, canDrop, isOverCurrent, isBefore } =
    useColumnDragAndDrop({ element });

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
      className={classnames(styles.itemContainer, {
        [styles.notLast]: !isLast,
        [styles.active]: isActive,
        [styles.dragging]: isDragging,
        [styles.dropTarget]: isOverCurrent && canDrop,
        [styles.dropBefore]: isBefore,
        [styles.dropAfter]: !isBefore,
      })}
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
      <div contentEditable={false} className={styles.columnIndicator}>
        {columnIndex + 1}/{totalColumns}
      </div>

      {/* 操作按钮区域 */}
      <If condition={!readOnly}>
        <div className={styles.actionButtons} contentEditable={false}>
          {/* 列拖拽排序手柄 */}
          {totalColumns > 1 && (
            <div
              ref={node => {
                drag(node);
              }}
              className={classnames(styles.columnDragHandle, {
                [styles.canDrag]: canDrag,
              })}
            >
              <MdDragIndicator />
            </div>
          )}
          {/* 删除按钮 */}
          <div className={styles.delete} onClick={onDelete}>
            <Trash2 size="1em" />
          </div>
        </div>
      </If>

      <div className={styles.content} {...attributes}>
        {children}
      </div>
    </div>
  );
};

export default MultiColumnItem;
