import React, { memo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import {
  useDrag,
  useDrop,
  DropTargetMonitor,
  DragSourceMonitor,
} from "react-dnd";
import { ColumnDef } from "../../types";
import TableIcon from "../icons/TableIcons";
import styles from "./index.module.less";
import classNames from "classnames";

// Item type for DnD
const COLUMN_HEADER = "columnHeader";

/**
 * 列标题属性
 */
interface ColumnHeaderProps {
  column: ColumnDef;
  width: number;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onSort?: (columnId: string) => void;
  sortDirection?: "asc" | "desc" | null;
  index: number;
  moveColumn: (dragIndex: number, hoverIndex: number) => void;
  onEdit?: (columnId: string) => void; // 列编辑回调
}

/**
 * 拖拽项目的接口
 */
interface DragItem {
  id: string;
  index: number;
  type: string;
}

/**
 * 表格列标题组件
 */
const ColumnHeader: React.FC<ColumnHeaderProps> = memo(
  ({
    column,
    width,
    onResizeStart,
    onSort,
    sortDirection,
    index,
    moveColumn,
    onEdit,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    // 处理调整大小开始
    const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onResizeStart(column.id, e.clientX, width);
    });

    // 处理排序点击
    const handleSortClick = useMemoizedFn((e: React.MouseEvent) => {
      e.stopPropagation(); // 防止拖拽触发
      if (onSort) {
        onSort(column.id);
      }
    });

    // 处理双击编辑
    const handleDoubleClick = useMemoizedFn((e: React.MouseEvent) => {
      e.stopPropagation();
      if (onEdit) {
        onEdit(column.id);
      }
    });

    // 实现拖拽功能
    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: COLUMN_HEADER,
        item: { id: column.id, index, type: COLUMN_HEADER },
        collect: (monitor: DragSourceMonitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [column.id, index],
    );

    // 实现拖放目标功能
    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: COLUMN_HEADER,
        collect: (monitor: DropTargetMonitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
        hover: (item: DragItem) => {
          if (!ref.current) {
            return;
          }
          const dragIndex = item.index;
          const hoverIndex = index;

          // 如果拖到自己上面，不做任何操作
          if (dragIndex === hoverIndex) {
            return;
          }

          // 执行移动，只要拖到其他列上就立即移动，不需要判断鼠标位置
          moveColumn(dragIndex, hoverIndex);

          // 更新item的索引以便后续操作
          item.index = hoverIndex;
        },
      }),
      [index, moveColumn],
    );

    // 将 drag 和 drop 引用函数连接到同一个元素上
    drag(drop(ref));

    // 列标题样式
    const headerStyle = {
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={ref}
        className={classNames(styles.tableHeader, {
          [styles.dragging]: isDragging,
          [styles.isOver]: isOver && canDrop && !isDragging,
        })}
        style={headerStyle}
        onDoubleClick={handleDoubleClick}
      >
        <div className={styles.headerContent}>
          <div
            className={styles.headerTitle}
            onClick={onSort ? handleSortClick : undefined}
            title={column.title}
          >
            <span className={styles.columnIcon}>
              <TableIcon iconName={column.icon} type={column.type} />
            </span>
            {column.title}
            {sortDirection && (
              <span
                className={classNames(styles.sortIndicator, {
                  [styles.asc]: sortDirection === "asc",
                  [styles.desc]: sortDirection === "desc",
                })}
              >
                {sortDirection === "asc" ? "↑" : "↓"}
              </span>
            )}
          </div>
          <div
            className={styles.resizeHandle}
            onMouseDown={handleResizeStart}
          />
        </div>
      </div>
    );
  },
);

export default ColumnHeader;
