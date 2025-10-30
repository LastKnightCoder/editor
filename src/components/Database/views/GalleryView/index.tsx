import React, { memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useDatabaseStore } from "../../hooks";
import { useFilteredAndSortedRows } from "../../hooks/useFilteredAndSortedRows";
import PluginManager from "../../PluginManager";
import { RowData, ColumnDef, CellValue } from "../../types";
import GalleryCard from "./GalleryCard";
import AddCard from "./AddCard";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";

const emptyOnCellChange = () => {
  // no-op
};

interface GalleryViewProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
}

const GalleryView: React.FC<GalleryViewProps> = memo(
  ({ pluginManager, theme, readonly }) => {
    const {
      columns,
      rows,
      viewConfig,
      addRow,
      updateCellValue,
      addColumn,
      editColumn,
      columnWidths,
    } = useDatabaseStore((state) => ({
      columns: state.columns,
      rows: state.rows,
      viewConfig: state.viewConfig,
      addRow: state.addRow,
      updateCellValue: state.updateCellValue,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      columnWidths: state.columnWidths,
    }));

    const [rowDetailOpen, setRowDetailOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<RowData | null>(null);
    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

    const { groupedRows, isGrouped } = useFilteredAndSortedRows(
      rows,
      columns,
      viewConfig,
      pluginManager,
    );

    const galleryConfig = viewConfig.galleryConfig ?? {
      coverType: "detail" as const,
    };

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

    const handleAddRow = useMemoizedFn(
      (groupColumn?: ColumnDef | null, groupValue?: CellValue) => {
        // 创建新行对象
        const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newRowData: Partial<RowData> = {
          id: newId,
        };

        // 如果有分组信息，设置分组字段的值
        if (groupColumn && groupValue !== undefined) {
          newRowData[groupColumn.id] = groupValue;
        }

        // 添加到 store（包含分组字段值）
        addRow(newRowData);

        // 构建完整的新行对象用于打开详情弹窗
        const newRow: RowData = {
          id: newId,
        };
        columns.forEach((column) => {
          newRow[column.id] = newRowData[column.id] ?? null;
        });

        // 立即打开新行的详情弹窗
        handleOpenRowDetail(newRow);
      },
    );

    const handleAddColumn = useMemoizedFn(() => {
      setEditingColumnId(null);
      setColumnEditOpen(true);
    });

    const handleSaveColumn = useMemoizedFn((columnData: Partial<ColumnDef>) => {
      if (editingColumnId) {
        editColumn(editingColumnId, columnData);
      } else {
        addColumn({
          title: columnData.title || `列 ${columns.length + 1}`,
          type: columnData.type || "text",
          ...columnData,
        });
      }
      setColumnEditOpen(false);
      setEditingColumnId(null);
    });

    const renderGroupHeader = useMemoizedFn(
      (group: {
        key: string;
        label: string;
        rows: RowData[];
        column: ColumnDef | null;
      }) => {
        if (!group.column) return null;
        const Renderer = pluginManager.getPlugin(group.column.type)?.Renderer;
        if (!Renderer) return null;

        const columnValue: CellValue =
          group.rows.length > 0 ? group.rows[0][group.column.id] : null;

        return (
          <div className="flex items-center gap-2 mb-4 -ml-1">
            <div className="flex items-center">
              <Renderer
                value={columnValue}
                column={group.column}
                theme={theme}
                readonly
                onCellValueChange={emptyOnCellChange}
              />
            </div>
            <span className="text-sm text-gray-500 font-normal">
              {group.rows.length}
            </span>
          </div>
        );
      },
    );

    return (
      <div className="w-full h-full flex flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          {groupedRows.map((group) => (
            <div key={group.key} className="mb-8 last:mb-0">
              {isGrouped && group.key !== "__all__" && renderGroupHeader(group)}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {group.rows.map((row) => (
                  <GalleryCard
                    key={row.id}
                    row={row}
                    columns={columns}
                    coverType={galleryConfig.coverType}
                    coverImageColumnId={galleryConfig.coverImageColumnId}
                    onClick={() => handleOpenRowDetail(row)}
                    theme={theme}
                  />
                ))}
                {!readonly && (
                  <AddCard
                    onClick={() => {
                      // 如果有分组，传递分组信息
                      if (isGrouped && group.column && group.rows.length > 0) {
                        const groupValue = group.rows[0][group.column.id];
                        handleAddRow(group.column, groupValue);
                      } else {
                        handleAddRow();
                      }
                    }}
                    theme={theme}
                  />
                )}
              </div>
            </div>
          ))}
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
          />
        )}
        {columnEditOpen && (
          <ColumnEditModal
            open={columnEditOpen}
            column={
              editingColumnId
                ? (() => {
                    const found = columns.find((c) => c.id === editingColumnId);
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
      </div>
    );
  },
);

GalleryView.displayName = "GalleryView";

export default GalleryView;
