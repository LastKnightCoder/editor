import React, { useRef, memo, useState, useMemo, useEffect } from "react";
import { useClickAway, useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ColumnDef, CellValue, RowData } from "../../types";
import { useDatabaseStore, useRowDetail } from "../../hooks";
import ColumnHeader from "./components/ColumnHeader";
import ColumnEditModal from "./components/ColumnEditModal";
import RowDetailModal from "../../components/RowDetailModal";
import Row from "./components/Row";
import FooterRow from "./components/FooterRow";
import { Plus } from "lucide-react";
import { Tooltip, ConfirmDialog } from "@tau/ui";
import { builtInAggregateRegistry } from "../../core/formula";
import type { DatabaseViewComponentProps } from "../types";

type TableViewProps = DatabaseViewComponentProps;

const emptyOnCellChange = () => {
  // no-op
};

const emptyStartResize = () => {
  // no-op
};

const TableView: React.FC<TableViewProps> = memo(
  ({
    pluginManager,
    aggregateRegistry,
    commands,
    startResize = emptyStartResize,
    theme,
    readonly,
    onRowDetailOpen,
    onRowAdd,
    onRowDelete,
    config,
  }) => {
    const {
      selectedCell,
      editingCell,
      columns: storeColumns,
      columnWidths,
      selectCell,
      startEditing,
      stopEditing,
      addRow,
      deleteRow,
      addColumn,
      editColumn,
      updateCellValue,
      deleteColumn,
      moveColumn,
      moveRow,
      clearCellSelection,
      footer,
      setFooter,
    } = useDatabaseStore(state => ({
      selectedCell: state.selectedCell,
      editingCell: state.editingCell,
      columns: state.columns,
      columnWidths: state.columnWidths,
      selectCell: state.selectCell,
      startEditing: state.startEditing,
      stopEditing: state.stopEditing,
      addRow: state.addRow,
      deleteRow: state.deleteRow,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      updateCellValue: state.updateCellValue,
      deleteColumn: state.deleteColumn,
      moveColumn: state.moveColumn,
      moveRow: state.moveRow,
      clearCellSelection: state.clearCellSelection,
      footer: state.viewConfig.footer,
      setFooter: state.setFooter,
    }));

    const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);

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
    const { detailRowId, openRowDetail, closeRowDetail } = useRowDetail(onRowDetailOpen);

    const handleMoveColumn = useMemoizedFn((columnId: string, targetId: string) => {
      moveColumn(columnId, targetId);
    });

    const handleMoveRow = useMemoizedFn((rowId: string, targetId: string) => {
      moveRow(rowId, targetId);
    });

    const handleAddRow = useMemoizedFn(() => {
      if (onRowAdd) {
        // 如果提供了自定义回调，调用它而不是默认行为
        onRowAdd();
      } else {
        addRow();
      }
    });

    const handleDeleteRow = useMemoizedFn((rowId: string) => {
      if (onRowDelete) {
        onRowDelete(rowId);
      } else {
        setConfirmDeleteRowId(rowId);
      }
    });

    const allowAddColumn = config?.allowAddColumn ?? true;
    const allowDeleteColumn = config?.allowDeleteColumn ?? true;

    const handleAddColumn = useMemoizedFn(() => {
      if (!allowAddColumn) return;
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
        if (!allowAddColumn) return;
        addColumn({
          title: columnData.title || `列 ${storeColumns.length + 1}`,
          type: columnData.type || "text",
          ...columnData,
        });
      }
      setColumnEditOpen(false);
      setEditingColumnId(null);
    });

    const handleCellChange = useMemoizedFn((rowId: string, columnId: string, value: CellValue) => {
      const column = storeColumns.find(c => c.id === columnId);
      const type = column?.type || "text";
      const transformed = pluginManager
        ? pluginManager.transformBeforeSave(type, value, column?.config)
        : value;
      updateCellValue(rowId, columnId, transformed);
    });

    const handleDeleteColumn = useMemoizedFn((columnId: string) => {
      if (!allowDeleteColumn) return;
      deleteColumn(columnId);
    });

    const handleCellDoubleClick = useMemoizedFn((rowId: string, columnId: string) => {
      selectCell(rowId, columnId);
      startEditing(rowId, columnId);
    });

    const projection = useDatabaseStore(state => state.projection);
    const { groups: groupedRows, grouped: isGrouped, columnIds: visibleColumnOrder } = projection;

    const searchActive = useDatabaseStore(state => state.query.searchResults !== null);
    const sortCount = useDatabaseStore(state => state.viewConfig.sorts.length);
    // 排序/搜索/只读时投影禁用手动排序（canReorder），手柄需给出原因而非假装可拖
    const reorderDisabledReason = readonly
      ? "只读模式下无法调整行顺序"
      : searchActive
        ? "搜索结果中无法手动调整行顺序"
        : sortCount > 0
          ? "已应用排序规则，无法手动调整行顺序"
          : undefined;

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
      groupedRows.forEach(group => {
        if (isGrouped && group.key !== "__all__" && group.column) {
          items.push({
            type: "header",
            key: group.key,
            column: group.column,
            columnValue: group.rows[0][group.column.id],
          });
        }
        group.rows.forEach(row => {
          items.push({ type: "row", row });
        });
      });
      return items;
    }, [groupedRows, isGrouped]);

    const rowIndexMap = useMemo(() => {
      const map = new Map<string, number>();
      let index = 0;
      flatItems.forEach(row => {
        if (row.type === "row") {
          map.set(row.row.id, ++index);
        }
      });
      return map;
    }, [flatItems]);

    const totalMinWidth = useMemo(() => {
      const colsWidth = visibleColumnOrder.reduce((sum, id) => sum + (columnWidths[id] || 200), 0);
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
      <div className="border-line-1 bg-surface sticky top-0 z-10 box-border flex w-full flex-col border-b">
        <div className="flex w-full min-w-max flex-row">
          <div className="border-line-2 box-border h-10 w-[50px] min-w-[50px] border-r"></div>
          {visibleColumnOrder.map(columnId => {
            const column = storeColumns.find(col => col.id === columnId);
            if (!column) return null;
            return (
              <ColumnHeader
                key={columnId}
                column={column}
                width={columnWidths[columnId] || 200}
                onResizeStart={startResize}
                moveColumn={handleMoveColumn}
                onEdit={handleEditColumn}
                onDelete={handleDeleteColumn}
                pluginManager={pluginManager}
                theme={theme}
                readonly={readonly}
                allowDeleteColumn={allowDeleteColumn}
                commands={commands}
              />
            );
          })}
          {allowAddColumn && (
            <div className="flex w-[40px] min-w-[40px] items-center justify-center">
              <Tooltip content="新列">
                <button
                  className="text-ink-3 hover:bg-hover hover:text-ink-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full border-0"
                  onClick={handleAddColumn}
                  type="button"
                >
                  <Plus className="size-4" strokeWidth={1.75} />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    ));

    const renderGroupHeader = useMemoizedFn(
      (item: { type: "header"; key: string; column: ColumnDef; columnValue: CellValue }) => {
        const Renderer = pluginManager.getPlugin(item.column.type)?.Renderer;
        if (!Renderer) return null;
        return (
          <div className="border-line-2 h-10 border-b">
            <Renderer
              value={item.columnValue}
              column={item.column}
              theme={theme}
              readonly
              onCellValueChange={emptyOnCellChange}
            />
          </div>
        );
      }
    );

    return (
      <div className="flex h-full w-full flex-col">
        {/* 滚动条内缩同 FadeScroll：4px 细条 + 右侧 6px 透明边；不接 edge fade，免得渐隐吸顶表头 */}
        <div
          className="min-h-0 w-full flex-1 overflow-auto border-r-[6px] border-r-transparent [&::-webkit-scrollbar-thumb]:rounded-[2px] [&::-webkit-scrollbar-track:horizontal]:mx-2.5 [&::-webkit-scrollbar-track:vertical]:my-2.5 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1"
          ref={scrollParentRef}
        >
          <div className="flex w-full flex-col pb-10" style={{ minWidth: `${totalMinWidth}px` }}>
            {renderHeader()}

            <div
              className="w-full"
              style={{
                position: "relative",
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
              ref={tableBodyRef}
            >
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
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
                      rowIndex={rowIndexMap.get(actualRow.id) ?? virtualRow.index + 1}
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
                      deleteRow={handleDeleteRow}
                      moveRow={projection.canReorder ? handleMoveRow : undefined}
                      reorderDisabledReason={reorderDisabledReason}
                      theme={theme}
                      readonly={readonly}
                      onOpenRowDetail={openRowDetail}
                      commands={commands}
                    />
                  </div>
                );
              })}
            </div>
            <FooterRow
              columns={storeColumns}
              columnOrder={visibleColumnOrder}
              columnWidths={columnWidths}
              rows={projection.rows}
              footer={footer}
              pluginManager={pluginManager}
              aggregateRegistry={aggregateRegistry ?? builtInAggregateRegistry}
              readonly={readonly}
              onChange={setFooter}
            />
          </div>
        </div>
        {!readonly && config?.allowAddRow !== false && (
          <div className="sticky bottom-0 z-20">
            <div className="relative box-border flex h-12 items-center gap-[10px]">
              <button
                className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm flex cursor-pointer items-center gap-1.5 p-2 transition-colors"
                onClick={handleAddRow}
                type="button"
              >
                <Plus className="size-[14px]" strokeWidth={1.75} />
                添加行
              </button>
            </div>
          </div>
        )}
        {columnEditOpen && (
          <ColumnEditModal
            open={columnEditOpen}
            column={
              editingColumnId
                ? (() => {
                    const found = storeColumns.find(c => c.id === editingColumnId);
                    if (!found) return null;
                    const width = columnWidths[editingColumnId] || found.width || 200;
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
        <ConfirmDialog
          open={confirmDeleteRowId !== null}
          onOpenChange={open => {
            if (!open) setConfirmDeleteRowId(null);
          }}
          title="删除行"
          impact="确定要删除该行吗？"
          danger
          confirmText="删除"
          onConfirm={() => {
            const rowId = confirmDeleteRowId;
            if (!rowId) return;
            deleteRow(rowId);
          }}
        />
        {detailRowId && (
          <RowDetailModal
            rowId={detailRowId}
            columns={storeColumns}
            pluginManager={pluginManager}
            theme={theme}
            onClose={closeRowDetail}
            onDeleteRow={config?.allowDeleteRow !== false ? handleDeleteRow : undefined}
            onAddColumn={handleAddColumn}
            readonly={readonly}
            allowDeleteColumn={allowDeleteColumn}
          />
        )}
      </div>
    );
  }
);

TableView.displayName = "TableView";

export default TableView;
