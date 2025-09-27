import React, { useRef } from "react";
import classNames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ColumnDef, RowData } from "../../types";
import Row from "./components/Row";
import PluginManager from "../../PluginManager";

interface GroupTableProps {
  groupKey: string;
  rows: RowData[];
  columns: ColumnDef[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  totalMinWidth: number;
  renderHeader: () => React.ReactNode;
  rowIndexMap: Map<string, number>;
  handlers: {
    onAddRow: () => void;
    onMoveRow: (dragIndex: number, hoverIndex: number) => void;
    onSelectCell: (rowId: string, columnId: string) => void;
    onDoubleClickCell: (rowId: string, columnId: string) => void;
    onStartEditing: (rowId: string, columnId: string) => void;
    onStopEditing: () => void;
    onCellChange: (rowId: string, columnId: string, value: unknown) => void;
    onColumnChange: (column: ColumnDef) => void;
    onDeleteRow: (rowId: string) => void;
  };
  selectedCell: { rowId: string; columnId: string } | null;
  editingCell: { rowId: string; columnId: string } | null;
}

const GroupTable: React.FC<GroupTableProps> = ({
  groupKey,
  rows,
  columns,
  columnOrder,
  columnWidths,
  pluginManager,
  theme,
  readonly,
  totalMinWidth,
  renderHeader,
  rowIndexMap,
  handlers,
  selectedCell,
  editingCell,
}) => {
  const showHeader = groupKey !== "全部";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 40,
    overscan: 10,
    getScrollElement: () => containerRef.current,
  });

  return (
    <div className="mb-8 border border-gray-300/50 rounded-md overflow-hidden">
      {showHeader && (
        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold border-b border-gray-300/70">
          {groupKey}
        </div>
      )}
      <div
        ref={containerRef}
        className="flex flex-col max-h-[60vh] overflow-auto"
        style={{ minWidth: `${totalMinWidth}px` }}
      >
        {renderHeader()}
        <div
          className="w-full"
          style={{
            position: "relative",
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const actualRow = rows[virtualRow.index];
            if (!actualRow) return null;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Row
                  row={actualRow}
                  rowIndex={
                    (rowIndexMap.get(actualRow.id) ?? virtualRow.index) + 1
                  }
                  columns={columns}
                  columnOrder={columnOrder}
                  columnWidths={columnWidths}
                  pluginManager={pluginManager}
                  selectedCell={selectedCell}
                  editingCell={editingCell}
                  onCellSelect={handlers.onSelectCell}
                  onCellDoubleClick={handlers.onDoubleClickCell}
                  onStartEditing={handlers.onStartEditing}
                  onStopEditing={handlers.onStopEditing}
                  onCellChange={handlers.onCellChange}
                  onColumnChange={handlers.onColumnChange}
                  deleteRow={handlers.onDeleteRow}
                  moveRow={handlers.onMoveRow}
                  theme={theme}
                  readonly={readonly}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center py-2 h-10 relative box-border gap-[10px] border-t border-gray-200 bg-white">
          <button
            className={classNames(
              "px-2 py-1 text-sm cursor-pointer rounded transition",
              {
                "hover:bg-gray-100": theme === "light",
                "hover:bg-gray-600": theme === "dark",
              },
            )}
            onClick={handlers.onAddRow}
            type="button"
          >
            + 添加行
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupTable;
