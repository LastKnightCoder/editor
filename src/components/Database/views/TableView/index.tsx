import React, { useRef, memo, useState, useMemo, useEffect } from "react";
import { useClickAway, useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ColumnDef, CellValue, RowData } from "../../types";
import { useColumnVisibility, useDatabaseStore } from "../../hooks";
import { useFilteredAndSortedRows } from "../../hooks/useFilteredAndSortedRows";
import ColumnHeader from "./components/ColumnHeader";
import PluginManager from "../../PluginManager";
import ColumnEditModal from "./components/ColumnEditModal";
import RowDetailModal from "./components/RowDetailModal";
import classNames from "classnames";
import Row from "./components/Row";

interface TableViewProps {
  pluginManager: PluginManager;
  startResize: (columnId: string, startX: number, startWidth: number) => void;
  theme: "light" | "dark";
  readonly: boolean;
}

const emptyOnCellChange = () => {
  // no-op
};

const TableView: React.FC<TableViewProps> = memo(
  ({ pluginManager, startResize, theme, readonly }) => {
    const {
      selectedCell,
      editingCell,
      columns: storeColumns,
      rows: storeRows,
      viewConfig,
      columnWidths,
      selectCell,
      startEditing,
      stopEditing,
      addRow,
      deleteRow,
      addColumn,
      editColumn,
      updateCellValue,
      deleteColumnWithCleanup,
      moveColumn,
      moveRow,
      clearCellSelection,
    } = useDatabaseStore((state) => ({
      selectedCell: state.selectedCell,
      editingCell: state.editingCell,
      columns: state.columns,
      rows: state.rows,
      viewConfig: state.viewConfig,
      columnWidths: state.columnWidths,
      selectCell: state.selectCell,
      startEditing: state.startEditing,
      stopEditing: state.stopEditing,
      addRow: state.addRow,
      deleteRow: state.deleteRow,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      updateCellValue: state.updateCellValue,
      deleteColumnWithCleanup: state.deleteColumnWithCleanup,
      moveColumn: state.moveColumn,
      moveRow: state.moveRow,
      clearCellSelection: state.clearCellSelection,
    }));

    const scrollParentRef = useRef<HTMLDivElement>(null);
    const tableBodyRef = useRef<HTMLDivElement>(null);

    useClickAway(() => {
      if (editingCell) {
        return;
      }
      clearCellSelection();
    }, tableBodyRef);

    const onColumnChange = useMemoizedFn((column: ColumnDef) => {
      editColumn(column.id, column);
    });

    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [rowDetailOpen, setRowDetailOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<RowData | null>(null);

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

    const handleDeleteColumn = useMemoizedFn(async (columnId: string) => {
      await deleteColumnWithCleanup(columnId, pluginManager);
    });

    const handleCellDoubleClick = useMemoizedFn(
      (rowId: string, columnId: string) => {
        selectCell(rowId, columnId);
        startEditing(rowId, columnId);
      },
    );

    const handleOpenRowDetail = useMemoizedFn((row: RowData) => {
      setEditingRow(row);
      setRowDetailOpen(true);
    });

    const handleCloseRowDetail = useMemoizedFn(() => {
      setRowDetailOpen(false);
      setEditingRow(null);
    });

    const handleSaveRowDetail = useMemoizedFn((rowData: Partial<RowData>) => {
      if (!editingRow) return;

      // 更新行数据
      Object.keys(rowData).forEach((key) => {
        if (key !== "id") {
          updateCellValue(editingRow.id, key, rowData[key]);
        }
      });
    });

    const visibleColumnOrder = useMemo(() => {
      const order = viewConfig.columnOrder.filter((columnId) =>
        isColumnVisible(columnId),
      );
      const existingIds = new Set(order);
      storeColumns.forEach((column) => {
        if (!existingIds.has(column.id) && isColumnVisible(column.id)) {
          order.push(column.id);
        }
      });
      return order;
    }, [viewConfig.columnOrder, storeColumns, isColumnVisible]);

    const { groupedRows, isGrouped } = useFilteredAndSortedRows(
      storeRows,
      storeColumns,
      viewConfig,
      pluginManager,
    );

    const flatItems = useMemo(() => {
      const items: Array<
        | {
            type: "header";
            key: string;
            column: ColumnDef;
            columnValue: CellValue;
          }
        | { type: "row"; row: RowData }
      > = [];
      groupedRows.forEach((group) => {
        if (isGrouped && group.key !== "__all__" && group.column) {
          items.push({
            type: "header",
            key: group.key,
            column: group.column,
            columnValue: group.rows[0][group.column.id],
          });
        }
        group.rows.forEach((row) => {
          items.push({ type: "row", row });
        });
      });
      return items;
    }, [groupedRows, isGrouped]);

    const rowIndexMap = useMemo(() => {
      const map = new Map<string, number>();
      let index = 0;
      flatItems.forEach((row) => {
        if (row.type === "row") {
          map.set(row.row.id, ++index);
        }
      });
      return map;
    }, [flatItems]);

    const totalMinWidth = useMemo(() => {
      const colsWidth = visibleColumnOrder.reduce(
        (sum, id) => sum + (columnWidths[id] || 200),
        0,
      );
      return 50 + colsWidth + 40;
    }, [visibleColumnOrder, columnWidths]);

    const rowVirtualizer = useVirtualizer({
      count: flatItems.length,
      getScrollElement: () => scrollParentRef.current,
      estimateSize: () => 40,
      overscan: 10,
    });

    useEffect(() => {
      const scrollElement = scrollParentRef.current;
      if (!scrollElement) return;

      const handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        scrollElement.scrollLeft += event.deltaY;
      };

      scrollElement.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        scrollElement.removeEventListener("wheel", handleWheel);
      };
    }, []);

    const renderHeader = useMemoizedFn(() => (
      <div
        className={classNames(
          "flex flex-col w-full sticky top-0 z-10 box-border border-y border-gray-400/50 bg-[var(--main-bg-color)]",
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
                onDelete={handleDeleteColumn}
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
    ));

    const renderGroupHeader = useMemoizedFn(
      (item: {
        type: "header";
        key: string;
        column: ColumnDef;
        columnValue: CellValue;
      }) => {
        const Renderer = pluginManager.getPlugin(item.column.type)?.Renderer;
        if (!Renderer) return null;
        return (
          <div className="h-10 border-b border-gray-400/50">
            <Renderer
              value={item.columnValue}
              column={item.column}
              theme={theme}
              readonly
              onCellValueChange={emptyOnCellChange}
            />
          </div>
        );
      },
    );

    return (
      <div className="w-full h-full flex flex-col">
        <div
          className="w-full flex-1 min-h-0 overflow-auto"
          ref={scrollParentRef}
        >
          <div
            className="flex flex-col w-full pb-10"
            style={{ minWidth: `${totalMinWidth}px` }}
          >
            {renderHeader()}

            <div
              className="w-full"
              style={{
                position: "relative",
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
              ref={tableBodyRef}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = flatItems[virtualRow.index];
                if (!item) return null;
                if (item.type === "header") {
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
                      {renderGroupHeader(item)}
                    </div>
                  );
                }

                const actualRow = item.row;
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
                        rowIndexMap.get(actualRow.id) ?? virtualRow.index + 1
                      }
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
                      deleteRow={deleteRow}
                      moveRow={handleMoveRow}
                      theme={theme}
                      readonly={readonly}
                      onOpenRowDetail={handleOpenRowDetail}
                    />
                  </div>
                );
              })}
            </div>
          </div>
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
        {columnEditOpen && (
          <ColumnEditModal
            open={columnEditOpen}
            column={
              editingColumnId
                ? (() => {
                    const found = storeColumns.find(
                      (c) => c.id === editingColumnId,
                    );
                    if (!found) return null;
                    const width =
                      columnWidths[editingColumnId] || found.width || 200;
                    return { ...found, width } as ColumnDef;
                  })()
                : null
            }
            onCancel={() => setColumnEditOpen(false)}
            onSave={handleSaveColumn}
            theme={theme}
            pluginManager={pluginManager}
          />
        )}
        {rowDetailOpen && editingRow && (
          <RowDetailModal
            row={editingRow}
            columns={storeColumns}
            pluginManager={pluginManager}
            theme={theme}
            onClose={handleCloseRowDetail}
            onSave={handleSaveRowDetail}
            onAddColumn={handleAddColumn}
            readonly={readonly}
          />
        )}
      </div>
    );
  },
);

TableView.displayName = "TableView";

export default TableView;
