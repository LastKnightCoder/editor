import React, { memo, useRef } from "react";
import {
  useDrag,
  useDrop,
  DropTargetMonitor,
  DragSourceMonitor,
} from "react-dnd";
import classnames from "classnames";

import { ColumnDef, RowData, CellCoord } from "../../types";
import Cell from "../Cell";
import styles from "./index.module.less";
import PluginManager from "../../PluginManager";

const ROW_TYPE = "tableRow";

interface RowDragItem {
  id: string;
  index: number;
  type: string;
}

interface RowProps {
  row: RowData;
  rowIndex: number; // 行序号
  columns: ColumnDef[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pluginManager: PluginManager; // 插件管理器
  selectedCell: CellCoord | null;
  editingCell: CellCoord | null;
  onCellSelect: (rowId: string, columnId: string) => void;
  onCellDoubleClick: (rowId: string, columnId: string) => void;
  onStartEditing: (rowId: string, columnId: string) => void;
  onStopEditing: () => void;
  onCellChange: (rowId: string, columnId: string, value: any) => void;
  onColumnChange: (column: ColumnDef) => void;
  moveRow?: (dragIndex: number, hoverIndex: number) => void; // 拖拽排序方法
}

const Row: React.FC<RowProps> = memo(
  ({
    row,
    rowIndex,
    columns,
    columnOrder,
    columnWidths,
    pluginManager,
    selectedCell,
    editingCell,
    onCellSelect,
    onCellDoubleClick,
    onStartEditing,
    onStopEditing,
    onCellChange,
    onColumnChange,
    moveRow,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    // 实现行拖拽功能
    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: ROW_TYPE,
        item: { id: row.id, index: rowIndex - 1, type: ROW_TYPE }, // rowIndex减1以匹配实际数组索引
        collect: (monitor: DragSourceMonitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [row.id, rowIndex],
    );

    // 实现行放置功能
    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: ROW_TYPE,
        collect: (monitor: DropTargetMonitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
        hover: (item: RowDragItem) => {
          if (!ref.current || !moveRow) {
            return;
          }

          const dragIndex = item.index;
          const hoverIndex = rowIndex - 1; // rowIndex减1以匹配实际数组索引

          if (dragIndex === hoverIndex) {
            return;
          }

          // 执行移动，不需要判断鼠标位置，直接移动
          moveRow(dragIndex, hoverIndex);

          // 更新item的索引
          item.index = hoverIndex;
        },
      }),
      [rowIndex, moveRow],
    );

    // 如果启用了行拖拽功能，则将拖拽引用连接到行元素
    if (moveRow) {
      drag(drop(ref));
    }

    return (
      <div
        ref={ref}
        className={classnames(styles.tr, {
          [styles.dragging]: isDragging,
          [styles.isOver]: isOver && canDrop,
        })}
      >
        {/* 行号 */}
        <div className={styles.rowHeader}>
          <div className={styles.rowNumber}>{rowIndex}</div>
          {moveRow && <div className={styles.dragHandle}></div>}
        </div>

        {/* 数据单元格 */}
        {columnOrder.map((columnId) => {
          const column = columns.find((col) => col.id === columnId);
          if (!column) return null;

          const isSelected =
            selectedCell?.rowId === row.id &&
            selectedCell?.columnId === columnId;
          const isEditing =
            editingCell?.rowId === row.id && editingCell?.columnId === columnId;
          const plugin = pluginManager.getPlugin(column.type);

          return (
            <Cell
              key={columnId}
              rowId={row.id}
              columnId={columnId}
              column={column}
              value={row[columnId]}
              width={columnWidths[columnId] || 200}
              isSelected={isSelected}
              isEditing={isEditing}
              plugin={plugin}
              onSelect={onCellSelect}
              onDoubleClick={onCellDoubleClick}
              onStartEditing={onStartEditing}
              onStopEditing={onStopEditing}
              onValueChange={onCellChange}
              onColumnChange={onColumnChange}
            />
          );
        })}
      </div>
    );
  },
);

export default Row;
