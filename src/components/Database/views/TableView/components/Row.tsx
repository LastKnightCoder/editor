import React, { memo, useMemo, useRef } from "react";
import {
  useDrag,
  useDrop,
  DropTargetMonitor,
  DragSourceMonitor,
} from "react-dnd";
import classnames from "classnames";

import { ColumnDef, RowData, CellCoord } from "../../../types";
import Cell from "./Cell";
import PluginManager from "../../../PluginManager";
import { MdDragIndicator } from "react-icons/md";
import { App, Dropdown, DropdownProps } from "antd";

const ROW_TYPE = "tableRow";

interface RowDragItem {
  id: string;
  index: number;
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
  onCellChange: (rowId: string, columnId: string, value: any) => void;
  onColumnChange: (column: ColumnDef) => void;
  moveRow?: (dragIndex: number, hoverIndex: number) => void; // 拖拽排序方法
  deleteRow: (rowId: string) => void;
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
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { modal } = App.useApp();

    const menuProps = useMemo(() => {
      return {
        trigger: ["click"],
        menu: {
          items: [
            {
              key: "delete",
              label: "删除",
              onClick: () => {
                modal.confirm({
                  title: "删除行",
                  content: "确定要删除该行吗？",
                  okButtonProps: {
                    danger: true,
                  },
                  onOk: () => deleteRow(row.id),
                });
              },
            },
          ],
        },
      } satisfies DropdownProps;
    }, [deleteRow]);

    const [, drag] = useDrag(
      () => ({
        type: ROW_TYPE,
        item: { id: row.id, index: rowIndex - 1, type: ROW_TYPE }, // rowIndex减1以匹配实际数组索引
        collect: (monitor: DragSourceMonitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [row.id, rowIndex],
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

          const dragIndex = item.index;
          const hoverIndex = rowIndex - 1; // rowIndex减1以匹配实际数组索引

          if (dragIndex === hoverIndex) {
            return;
          }

          moveRow(dragIndex, hoverIndex);
          item.index = hoverIndex;
        },
      }),
      [rowIndex, moveRow],
    );

    if (moveRow) {
      drag(drop(ref));
    }

    return (
      <div
        ref={ref}
        className={classnames(
          "h-10 flex flex-row w-full min-w-max transition-[box-shadow,background-color,transform] duration-150 ease-linear",
          {
            "hover:bg-gray-700/50": theme === "dark",
            "hover:bg-gray-100": theme === "light",
          },
          "border-b border-gray-400/50",
        )}
      >
        <div className="w-[50px] min-w-[50px] box-border border-r border-gray-400/50 flex flex-col justify-center items-center relative cursor-grab group">
          <div className="flex gap-1 items-center text-gray-500 text-[12px] py-2">
            <Dropdown {...menuProps} className="cursor-pointer">
              <MdDragIndicator />
            </Dropdown>
            <span>{rowIndex}</span>
          </div>
        </div>

        {columnOrder.map((columnId) => {
          const column = columns.find((col) => col.id === columnId);
          if (!column) return null;

          const isSelected =
            selectedCell?.rowId === row.id &&
            selectedCell?.columnId === columnId;
          const isEditing =
            editingCell?.rowId === row.id && editingCell?.columnId === columnId;
          const plugin = pluginManager.getPlugin(column.type);
          const renderedValue = plugin
            ? pluginManager.transformAfterLoad(
                column.type,
                row[columnId],
                column.config,
              )
            : row[columnId];

          return (
            <Cell
              key={columnId}
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
            />
          );
        })}
      </div>
    );
  },
);

export default Row;
