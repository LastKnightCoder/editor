import React, { useRef } from "react";
import { useClickAway, useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ColumnDef, CellValue } from "../types";
import { useColumnVisibility, useTableStore } from "../hooks";
import ColumnHeader from "./ColumnHeader";
import Row from "./Row";
import PluginManager from "../PluginManager";
import ColumnEditModal from "./ColumnEditModal";
import classNames from "classnames";

interface TableContentProps {
  pluginManager: PluginManager;
  startResize: (columnId: string, startX: number, startWidth: number) => void;
  theme: "light" | "dark";
  readonly: boolean;
}

const TableContent: React.FC<TableContentProps> = ({
  pluginManager,
  startResize,
  theme,
  readonly,
}) => {
  const {
    selectedCell,
    editingCell,
    columns: storeColumns,
    rows: storeRows,
    columnOrder,
    columnWidths,
    selectCell,
    startEditing,
    stopEditing,
    addRow,
    addColumn,
    editColumn,
    updateCellValue,
    moveColumn,
    moveRow,
    clearCellSelection,
  } = useTableStore((state) => ({
    selectedCell: state.selectedCell,
    editingCell: state.editingCell,
    columns: state.columns,
    rows: state.rows,
    columnOrder: state.columnOrder,
    columnWidths: state.columnWidths,
    selectCell: state.selectCell,
    startEditing: state.startEditing,
    stopEditing: state.stopEditing,
    addRow: state.addRow,
    addColumn: state.addColumn,
    editColumn: state.editColumn,
    updateCellValue: state.updateCellValue,
    moveColumn: state.moveColumn,
    moveRow: state.moveRow,
    clearCellSelection: state.clearCellSelection,
  }));

  // 作为虚拟列表滚动容器
  const scrollParentRef = useRef<HTMLDivElement>(null);

  useClickAway(() => {
    if (editingCell) {
      return;
    }
    clearCellSelection();
  }, scrollParentRef);

  const onColumnChange = useMemoizedFn((column: ColumnDef) => {
    editColumn(column.id, column);
  });

  const [columnEditOpen, setColumnEditOpen] = React.useState(false);
  const [editingColumnId, setEditingColumnId] = React.useState<string | null>(
    null,
  );

  const { isColumnVisible } = useColumnVisibility(storeColumns);

  const handleMoveColumn = useMemoizedFn(
    (dragIndex: number, hoverIndex: number) => {
      moveColumn(dragIndex, hoverIndex);
    },
  );

  const handleMoveRow = useMemoizedFn(
    (dragIndex: number, hoverIndex: number) => {
      moveRow(dragIndex, hoverIndex);
    },
  );

  const handleAddRow = useMemoizedFn(() => {
    addRow();
  });

  const handleAddColumn = useMemoizedFn(() => {
    setEditingColumnId(null);
    setColumnEditOpen(true);
  });

  const handleEditColumn = useMemoizedFn((columnId: string) => {
    setEditingColumnId(columnId);
    setColumnEditOpen(true);
  });

  const handleSaveColumn = useMemoizedFn((columnData: Partial<ColumnDef>) => {
    if (editingColumnId) {
      editColumn(editingColumnId, columnData);
    } else {
      addColumn({
        title: columnData.title || `列 ${storeColumns.length + 1}`,
        type: columnData.type || "text",
        ...columnData,
      });
    }
    setColumnEditOpen(false);
    setEditingColumnId(null);
  });

  const handleCellChange = useMemoizedFn(
    (rowId: string, columnId: string, value: CellValue) => {
      const column = storeColumns.find((c) => c.id === columnId);
      const type = column?.type || "text";
      const transformed = pluginManager
        ? pluginManager.transformBeforeSave(type, value, column?.config)
        : value;
      updateCellValue(rowId, columnId, transformed);
    },
  );

  const handleCellDoubleClick = useMemoizedFn(
    (rowId: string, columnId: string) => {
      selectCell(rowId, columnId);
      startEditing(rowId, columnId);
    },
  );

  const visibleColumnOrder = columnOrder.filter((columnId) =>
    isColumnVisible(columnId),
  );

  const editingColumn = editingColumnId
    ? (() => {
        const col = storeColumns.find((c) => c.id === editingColumnId) || null;
        if (!col) return null;
        const width = columnWidths[editingColumnId] || col.width || 200;
        return { ...col, width } as ColumnDef;
      })()
    : null;

  const totalMinWidth = React.useMemo(() => {
    const colsWidth = visibleColumnOrder.reduce(
      (sum, id) => sum + (columnWidths[id] || 200),
      0,
    );
    return 50 + colsWidth + 40;
  }, [visibleColumnOrder, columnWidths]);

  // 行虚拟化（单行高度为 40px，对应 h-10）
  const rowVirtualizer = useVirtualizer({
    count: storeRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 40,
    overscan: 6,
  });

  return (
    <div className="w-full h-full flex flex-col">
      {/* 单一内部滚动容器，头部 sticky，天然与水平方向同步 */}
      <div
        className="w-full flex-1 min-h-0 overflow-auto"
        ref={scrollParentRef}
      >
        <div
          className="flex flex-col w-full pb-10"
          style={{ minWidth: `${totalMinWidth}px` }}
        >
          <div
            className={classNames(
              "flex flex-col w-full sticky top-0 z-10 box-border border-b border-gray-400/50 bg-[var(--main-bg-color)]",
            )}
          >
            <div className="flex flex-row w-full min-w-max">
              <div className="w-[50px] min-w-[50px] h-10 box-border border-r border-gray-400/50"></div>

              {visibleColumnOrder.map((columnId, index) => {
                const column = storeColumns.find((col) => col.id === columnId);
                if (!column) return null;

                return (
                  <ColumnHeader
                    key={columnId}
                    column={column}
                    width={columnWidths[columnId] || 200}
                    onResizeStart={startResize}
                    index={index}
                    moveColumn={handleMoveColumn}
                    onEdit={handleEditColumn}
                    pluginManager={pluginManager}
                    theme={theme}
                    readonly={readonly}
                  />
                );
              })}

              <div className="w-[40px] min-w-[40px] flex items-center justify-center">
                <button
                  className={classNames(
                    "w-6 h-6 rounded-full border-0 text-base leading-none cursor-pointer flex items-center justify-center p-0]",
                    {
                      "hover:bg-gray-100 text-gray-600": theme === "light",
                      "hover:bg-gray-600 text-gray-200": theme === "dark",
                    },
                  )}
                  onClick={handleAddColumn}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div
            className="w-full"
            style={{
              position: "relative",
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const actualRow = storeRows[virtualRow.index];
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
                    key={actualRow.id}
                    row={actualRow}
                    rowIndex={virtualRow.index + 1}
                    columns={storeColumns}
                    columnOrder={visibleColumnOrder}
                    columnWidths={columnWidths}
                    pluginManager={pluginManager}
                    selectedCell={selectedCell}
                    editingCell={editingCell}
                    onCellSelect={selectCell}
                    onCellDoubleClick={handleCellDoubleClick}
                    onStartEditing={startEditing}
                    onStopEditing={stopEditing}
                    onCellChange={handleCellChange}
                    onColumnChange={onColumnChange}
                    moveRow={handleMoveRow}
                    theme={theme}
                    readonly={readonly}
                  />
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 z-20 backdrop-blur">
            <div className="flex items-center py-2 h-10 relative box-border gap-[10px]">
              <button
                className={classNames(
                  "px-2 py-1 text-sm cursor-pointer rounded transition",
                  {
                    "hover:bg-gray-100": theme === "light",
                    "hover:bg-gray-600": theme === "dark",
                  },
                )}
                onClick={handleAddRow}
                type="button"
              >
                + 添加行
              </button>
            </div>
          </div>
        </div>
      </div>
      {columnEditOpen && (
        <ColumnEditModal
          open={columnEditOpen}
          column={editingColumn}
          onCancel={() => setColumnEditOpen(false)}
          onSave={handleSaveColumn}
          theme={theme}
          pluginManager={pluginManager}
        />
      )}
    </div>
  );
};

export default TableContent;
