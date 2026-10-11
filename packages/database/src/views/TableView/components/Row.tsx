import React, { memo, useRef } from "react";
import { useDrag, useDrop, DropTargetMonitor, DragSourceMonitor } from "react-dnd";
import classnames from "classnames";
import { GripVertical } from "lucide-react";
import { Menu } from "@tau/ui";

import { ColumnDef, RowData, CellCoord, CellValue } from "../../../types";
import type { DatabaseCommandsRuntime } from "../../../commands";
import { visibleCommands } from "../../../commands";
import Cell from "./Cell";
import PluginManager from "../../../PluginManager";
import CommandMenuItems from "../../../components/CommandMenuItems";

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
  /** 扩展命令运行时；扩展项排在「删除」之前，二者之间有分隔线 */
  commands?: DatabaseCommandsRuntime;
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
    commands,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

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

    const rowCommands = commands
      ? visibleCommands(commands.definitions, "row", { api: commands.api, rowId: row.id })
      : [];

    return (
      <div
        ref={ref}
        className={classnames(
          "border-line-2 hover:bg-hover flex h-10 w-full min-w-max flex-row border-b",
          "ease-tau-out transition-colors duration-[160ms]"
        )}
      >
        <div className="group/row border-line-2 relative box-border flex w-[50px] min-w-[50px] cursor-grab flex-col items-center justify-center border-r">
          <div className="text-ink-3 text-tau-sm flex items-center gap-1 py-2 tabular-nums">
            <Menu
              align="start"
              trigger={
                <button
                  type="button"
                  title="行操作"
                  className="text-ink-3 hover:text-ink-1 grid size-[18px] cursor-pointer place-items-center rounded-[5px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
                >
                  <GripVertical className="size-4" strokeWidth={1.75} />
                </button>
              }
            >
              {rowCommands.length > 0 && commands && (
                <>
                  <CommandMenuItems items={rowCommands} api={commands.api} rowId={row.id} />
                  <Menu.Separator />
                </>
              )}
              <Menu.Item danger onSelect={() => deleteRow(row.id)}>
                删除
              </Menu.Item>
            </Menu>
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
