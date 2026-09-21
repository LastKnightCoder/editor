import React, { memo, useMemo, useRef } from "react";
import { useDrag, useDrop, DropTargetMonitor, DragSourceMonitor } from "react-dnd";
import classnames from "classnames";

import { ColumnDef, RowData, CellCoord, CellValue } from "../../../types";
import Cell from "./Cell";
import PluginManager from "../../../PluginManager";
import { MdDragIndicator } from "react-icons/md";
import { Dropdown, DropdownProps } from "antd";

import { useThemeColors } from "@/hooks";

const ROW_TYPE = "tableRow";

interface RowDragItem {
  id: string;
  type: string;
}

interface RowProps {
  row: RowData;
  rowIndex: number;
  columns: ColumnDef[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  theme: "light" | "dark";
  readonly: boolean;
  pluginManager: PluginManager;
  selectedCell: CellCoord | null;
  editingCell: CellCoord | null;
  onCellSelect: (rowId: string, columnId: string) => void;
  onCellDoubleClick: (rowId: string, columnId: string) => void;
  onStartEditing: (rowId: string, columnId: string) => void;
  onStopEditing: () => void;
  onCellChange: (rowId: string, columnId: string, value: CellValue) => void;
  onColumnChange: (column: ColumnDef) => void;
  moveRow?: (rowId: string, targetId: string) => void;
  deleteRow: (rowId: string) => void;
  onOpenRowDetail?: (row: RowData) => void;
}

const Row: React.FC<RowProps> = memo(
  ({
    row,
    rowIndex,
    columns,
    columnOrder,
    columnWidths,
    readonly,
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
    theme,
    deleteRow,
    onOpenRowDetail,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { hoverClass, borderClass } = useThemeColors();

    const menuProps = useMemo(() => {
      return {
        trigger: ["click"],
        menu: {
          items: [
            {
              key: "delete",
              label: "删除",
              onClick: () => {
                deleteRow(row.id);
              },
            },
          ],
        },
      } satisfies DropdownProps;
    }, [deleteRow, row.id]);

    const [, drag] = useDrag(
      () => ({
        type: ROW_TYPE,
        item: { id: row.id, type: ROW_TYPE },
        canDrag: () => Boolean(moveRow) && !readonly,
        collect: (monitor: DragSourceMonitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [row.id, moveRow, readonly]
    );

    const [, drop] = useDrop(
      () => ({
        accept: ROW_TYPE,
        collect: (monitor: DropTargetMonitor) => ({
          isOver: monitor.isOver(),
          canDrop: !readonly && monitor.canDrop(),
        }),
        hover: (item: RowDragItem) => {
          if (!ref.current || !moveRow || readonly) {
            return;
          }

          if (item.id === row.id) {
            return;
          }

          moveRow(item.id, row.id);
        },
      }),
      [row.id, moveRow, readonly]
    );

    if (moveRow) {
      drag(drop(ref));
    }

    return (
      <div
        ref={ref}
        className={classnames(
          "flex h-10 w-full min-w-max flex-row border-b transition-[box-shadow,background-color,transform] duration-150 ease-linear",
          borderClass,
          hoverClass
        )}
      >
        <div
          className={classnames(
            "group relative box-border flex w-[50px] min-w-[50px] cursor-grab flex-col items-center justify-center border-r",
            borderClass
          )}
        >
          <div className="flex items-center gap-1 py-2 text-[12px] text-gray-500">
            <Dropdown {...menuProps}>
              <span className="flex cursor-pointer items-center">
                <MdDragIndicator />
              </span>
            </Dropdown>
            <span>{rowIndex}</span>
          </div>
        </div>

        {columnOrder.map(columnId => {
          const column = columns.find(col => col.id === columnId);
          if (!column) return null;

          const isSelected = selectedCell?.rowId === row.id && selectedCell?.columnId === columnId;
          const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === columnId;
          const plugin = pluginManager.getPlugin(column.type);
          const renderedValue = plugin
            ? pluginManager.transformAfterLoad(column.type, row[columnId], column.config)
            : row[columnId];

          return (
            <Cell
              key={`${row.id}-${columnId}`}
              rowId={row.id}
              columnId={columnId}
              column={column}
              value={renderedValue}
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
              theme={theme}
              readonly={readonly}
              row={row}
              onOpenRowDetail={onOpenRowDetail}
            />
          );
        })}
      </div>
    );
  }
);

export default Row;
