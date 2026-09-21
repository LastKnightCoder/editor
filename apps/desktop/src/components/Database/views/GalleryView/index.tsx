import React, { memo, useState, useRef, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDatabaseStore } from "../../hooks";
import PluginManager from "../../PluginManager";
import { RowData, ColumnDef, CellValue, DatabaseConfig } from "../../types";
import GalleryCard from "./GalleryCard";
import AddCard from "./AddCard";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";
import { ConfirmDialog } from "@tau/ui/ConfirmDialog";
import { v4 as uuidv4 } from "uuid";
const emptyOnCellChange = () => {
  // no-op
};

interface GalleryViewProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onRowDetailOpen?: (row: RowData) => void;
  onRowAdd?: (defaultData?: Partial<RowData>) => void;
  onRowDelete?: (rowId: string) => void | Promise<void>;
  config?: DatabaseConfig;
}

const GalleryView: React.FC<GalleryViewProps> = memo(
  ({ pluginManager, theme, readonly, onRowDetailOpen, onRowAdd, onRowDelete, config }) => {
    const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);

    const {
      columns,
      viewConfig,
      addRow,
      updateCellValue,
      addColumn,
      editColumn,
      columnWidths,
      deleteRow,
    } = useDatabaseStore(state => ({
      columns: state.columns,
      viewConfig: state.viewConfig,
      addRow: state.addRow,
      updateCellValue: state.updateCellValue,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      columnWidths: state.columnWidths,
      deleteRow: state.deleteRow,
    }));

    const [rowDetailOpen, setRowDetailOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<RowData | null>(null);
    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [columnsPerRow, setColumnsPerRow] = useState(4);

    const projection = useDatabaseStore(state => state.projection);
    const { groups: groupedRows, grouped: isGrouped } = projection;

    const galleryConfig = viewConfig.galleryConfig ?? {
      coverType: "detail" as const,
    };

    const handleOpenRowDetail = useMemoizedFn((row: RowData) => {
      if (onRowDetailOpen) {
        onRowDetailOpen(row);
      } else {
        setEditingRow(row);
        setRowDetailOpen(true);
      }
    });

    const handleCloseRowDetail = useMemoizedFn(() => {
      setRowDetailOpen(false);
      setEditingRow(null);
    });

    const handleSaveRowDetail = useMemoizedFn((rowData: Partial<RowData>) => {
      if (!editingRow) return;

      // 更新行数据
      Object.keys(rowData).forEach(key => {
        if (key !== "id") {
          updateCellValue(editingRow.id, key, rowData[key]);
        }
      });
    });

    const allowAddColumn = config?.allowAddColumn ?? true;
    const allowDeleteColumn = config?.allowDeleteColumn ?? true;

    const handleAddRow = useMemoizedFn((groupColumn?: ColumnDef | null, groupValue?: CellValue) => {
      // 创建新行对象
      const newRowData: Partial<RowData> = {};

      // 如果有分组信息，设置分组字段的值
      if (groupColumn && groupValue !== undefined) {
        newRowData[groupColumn.id] = groupValue;
      }

      // 如果提供了自定义回调，调用它而不是默认行为
      if (onRowAdd) {
        onRowAdd(newRowData);
      } else {
        const newId = uuidv4();
        newRowData.id = newId;

        // 添加到 store（包含分组字段值）
        addRow(newRowData);

        // 构建完整的新行对象用于打开详情弹窗
        const newRow: RowData = {
          id: newId,
        };
        columns.forEach(column => {
          newRow[column.id] = newRowData[column.id] ?? null;
        });

        // 只有在没有自定义 onRowDetailOpen 时才自动打开内部的详情弹窗
        if (!onRowDetailOpen) {
          setEditingRow(newRow);
          setRowDetailOpen(true);
        }
      }
    });

    const handleAddColumn = useMemoizedFn(() => {
      if (!allowAddColumn) return;
      setEditingColumnId(null);
      setColumnEditOpen(true);
    });

    const handleSaveColumn = useMemoizedFn((columnData: Partial<ColumnDef>) => {
      if (editingColumnId) {
        editColumn(editingColumnId, columnData);
      } else {
        if (!allowAddColumn) return;
        addColumn({
          title: columnData.title || `列 ${columns.length + 1}`,
          type: columnData.type || "text",
          ...columnData,
        });
      }
      setColumnEditOpen(false);
      setEditingColumnId(null);
    });

    const handleDeleteRow = useMemoizedFn((rowId: string) => {
      if (onRowDelete) {
        onRowDelete(rowId);
      } else {
        setConfirmDeleteRowId(rowId);
      }
    });

    const renderGroupHeader = useMemoizedFn(
      (group: { key: string; label: string; rows: RowData[]; column: ColumnDef | null }) => {
        if (!group.column) return null;
        const Renderer = pluginManager.getPlugin(group.column.type)?.Renderer;
        if (!Renderer) return null;

        const columnValue: CellValue =
          group.rows.length > 0 ? group.rows[0][group.column.id] : null;

        return (
          <div className="-ml-1 mb-4 flex items-center gap-2">
            <div className="flex items-center">
              <Renderer
                value={columnValue}
                column={group.column}
                theme={theme}
                readonly
                onCellValueChange={emptyOnCellChange}
              />
            </div>
            <span className="text-tau-sm text-ink-3 tabular-nums">{group.rows.length}</span>
          </div>
        );
      }
    );

    // 响应式计算列数
    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const updateColumns = () => {
        const width = container.clientWidth - 48; // 减去 padding (px-6 = 24px * 2)
        // 每列最小 320px (对应 minmax(320px,1fr))，间隙 16px
        const cols = Math.floor((width + 16) / (320 + 16));
        setColumnsPerRow(Math.max(1, Math.min(cols, 6)));
      };

      updateColumns();

      const resizeObserver = new ResizeObserver(() => {
        updateColumns();
      });

      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
      };
    }, []);

    // 准备虚拟滚动所需的数据结构
    // 每一行卡片作为一个独立的虚拟项
    type VirtualRow =
      | { type: "header"; group: (typeof groupedRows)[0] }
      | {
          type: "cardRow";
          cards: RowData[];
          group: (typeof groupedRows)[0];
          isLastRow: boolean;
        };

    const virtualRows: VirtualRow[] = useMemo(() => {
      const rows: VirtualRow[] = [];
      groupedRows.forEach(group => {
        // 添加分组标题行
        if (isGrouped && group.key !== "__all__") {
          rows.push({ type: "header", group });
        }

        // 将卡片按列数分组为行，每一行作为独立的虚拟项
        const groupRowsData = group.rows;

        if (groupRowsData.length === 0 && !readonly) {
          // 空分组，只显示 AddCard
          rows.push({
            type: "cardRow",
            cards: [],
            group,
            isLastRow: true,
          });
        } else {
          for (let i = 0; i < groupRowsData.length; i += columnsPerRow) {
            const cardRow = groupRowsData.slice(i, i + columnsPerRow);
            const isLastRow = i + columnsPerRow >= groupRowsData.length;
            rows.push({
              type: "cardRow",
              cards: cardRow,
              group,
              isLastRow,
            });
          }
        }
      });
      return rows;
    }, [groupedRows, isGrouped, columnsPerRow, readonly]);

    // 虚拟滚动
    const virtualizer = useVirtualizer({
      count: virtualRows.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: index => {
        const row = virtualRows[index];
        if (row.type === "header") {
          return 48; // 分组标题高度
        } else {
          // 卡片高 240 + 行距 16（与列间 gap-4 一致）
          return 256;
        }
      },
      overscan: 5,
    });

    return (
      <div className="flex h-full w-full flex-col">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map(virtualItem => {
              const virtualRow = virtualRows[virtualItem.index];

              if (virtualRow.type === "header") {
                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderGroupHeader(virtualRow.group)}
                  </div>
                );
              }

              // 渲染单行卡片
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div
                    className="mb-4 grid gap-4"
                    style={{
                      gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
                    }}
                  >
                    {virtualRow.cards.map(row => (
                      <GalleryCard
                        key={row.id}
                        row={row}
                        columns={columns}
                        coverType={galleryConfig.coverType}
                        coverImageColumnId={galleryConfig.coverImageColumnId}
                        onClick={() => handleOpenRowDetail(row)}
                        onDelete={readonly ? undefined : () => handleDeleteRow(row.id)}
                        readonly={readonly}
                        theme={theme}
                      />
                    ))}
                    {/* 在最后一行添加 AddCard */}
                    {!readonly && config?.allowAddRow !== false && virtualRow.isLastRow && (
                      <AddCard
                        onClick={() => {
                          // 如果有分组，传递分组信息
                          if (
                            isGrouped &&
                            virtualRow.group.column &&
                            virtualRow.group.rows.length > 0
                          ) {
                            const groupValue = virtualRow.group.rows[0][virtualRow.group.column.id];
                            handleAddRow(virtualRow.group.column, groupValue);
                          } else {
                            handleAddRow();
                          }
                        }}
                        theme={theme}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {rowDetailOpen && editingRow && (
          <RowDetailModal
            row={editingRow}
            columns={columns}
            pluginManager={pluginManager}
            theme={theme}
            onClose={handleCloseRowDetail}
            onSave={handleSaveRowDetail}
            onAddColumn={handleAddColumn}
            readonly={readonly}
            allowDeleteColumn={allowDeleteColumn}
          />
        )}
        {columnEditOpen && (
          <ColumnEditModal
            open={columnEditOpen}
            column={
              editingColumnId
                ? (() => {
                    const found = columns.find(c => c.id === editingColumnId);
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
      </div>
    );
  }
);

GalleryView.displayName = "GalleryView";

export default GalleryView;
