import React, { memo, useState, useMemo, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { useDatabaseStore } from "../../hooks";
import PluginManager from "../../PluginManager";
import { RowData, ColumnDef, CellValue, SelectOption, DatabaseConfig } from "../../types";
import KanbanColumn from "./KanbanColumn";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";
import { ConfirmDialog } from "@tau/ui";
import { v4 as uuidv4 } from "uuid";
import { resolveKanbanCardDisplay } from "./cardDisplayConfig";
interface KanbanViewProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onRowDetailOpen?: (row: RowData) => void;
  onRowAdd?: (defaultData?: Partial<RowData>) => void;
  onRowDelete?: (rowId: string) => void | Promise<void>;
  config?: DatabaseConfig;
}

const KanbanView: React.FC<KanbanViewProps> = memo(
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
      moveRow,
      setKanbanConfig,
      deleteRow,
    } = useDatabaseStore(state => ({
      columns: state.columns,
      viewConfig: state.viewConfig,
      addRow: state.addRow,
      updateCellValue: state.updateCellValue,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      columnWidths: state.columnWidths,
      moveRow: state.moveRow,
      setKanbanConfig: state.setKanbanConfig,
      deleteRow: state.deleteRow,
    }));

    const [rowDetailOpen, setRowDetailOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<RowData | null>(null);
    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const scrollParentRef = useRef<HTMLDivElement>(null);

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

    // 获取看板配置
    const kanbanConfig = viewConfig.kanbanConfig;
    const groupColumnId = kanbanConfig?.groupColumnId;

    // 获取分组列
    const groupColumn = useMemo(() => {
      return columns.find(col => col.id === groupColumnId);
    }, [columns, groupColumnId]);
    const primaryColumn = useMemo(() => columns.find(column => column.isPrimary), [columns]);
    const cardDisplay = useMemo(
      () =>
        resolveKanbanCardDisplay({
          columns,
          viewConfig,
          kanbanConfig,
          primaryColumnId: primaryColumn?.id,
          groupColumnId,
        }),
      [columns, viewConfig, kanbanConfig, primaryColumn?.id, groupColumnId]
    );

    const projection = useDatabaseStore(state => state.projection);
    const groupedData = projection.groups;

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
      Object.keys(rowData).forEach(key => {
        if (key !== "id") {
          updateCellValue(editingRow.id, key, rowData[key]);
        }
      });
    });

    const handleAddCard = useMemoizedFn((groupValue: CellValue) => {
      if (!groupColumnId) return;

      const newRowData: Partial<RowData> = {
        [groupColumnId]: groupValue,
      };

      // 如果提供了自定义回调，调用它而不是默认行为
      if (onRowAdd) {
        onRowAdd(newRowData);
      } else {
        const newId = uuidv4();
        newRowData.id = newId;

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

    const handleMoveCard = useMemoizedFn((dragRowId: string, hoverRowId: string) => {
      moveRow(dragRowId, hoverRowId);
    });

    const handleChangeCardGroup = useMemoizedFn((rowId: string, newGroupValue: CellValue) => {
      if (!groupColumnId) return;
      updateCellValue(rowId, groupColumnId, newGroupValue);
    });
    const handleToggleDone = useMemoizedFn((rowId: string, checked: boolean) => {
      if (readonly) return;
      if (!cardDisplay.doneColumnId) return;
      updateCellValue(rowId, cardDisplay.doneColumnId, checked);
    });

    const handleMoveColumn = useMemoizedFn(
      (dragGroupValue: CellValue, hoverGroupValue: CellValue) => {
        // 更新列顺序配置
        if (!groupColumn || groupColumn.type !== "select") return;

        const selectConfig = groupColumn.config as { options?: SelectOption[] };
        const options = selectConfig?.options || [];

        // 获取当前的 columnOrder
        const currentOrder = kanbanConfig?.columnOrder || options.map(opt => opt.id);

        // 找到拖拽和悬停的索引
        const dragIndex = currentOrder.indexOf(String(dragGroupValue));
        const hoverIndex = currentOrder.indexOf(String(hoverGroupValue));

        if (dragIndex === -1 || hoverIndex === -1) return;

        // 重新排序
        const newOrder = [...currentOrder];
        const [removed] = newOrder.splice(dragIndex, 1);
        newOrder.splice(hoverIndex, 0, removed);

        setKanbanConfig({ ...kanbanConfig, groupColumnId: groupColumn.id, columnOrder: newOrder });
      }
    );

    const handleDeleteCard = useMemoizedFn((rowId: string) => {
      if (onRowDelete) {
        // 如果提供了自定义删除回调，直接调用它（外部会处理确认）
        onRowDelete(rowId);
      } else {
        // 否则显示确认对话框后使用内部的 deleteRow
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

    if (!groupColumn || groupColumn.type !== "select") {
      return (
        <div className="text-ink-2 flex h-full w-full items-center justify-center">
          <div className="text-center">
            <div className="text-ink-1 text-tau-body-lg mb-2 font-medium">无法显示看板视图</div>
            <div className="text-tau-sm text-ink-3">
              {!groupColumn ? "未配置分组列" : "分组列类型必须是单选类型"}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col">
        {/* 看板列容器 */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={scrollParentRef}>
          <div className="flex h-full gap-4 p-4">
            {groupedData.map((group, index) => (
              <KanbanColumn
                key={group.value == null ? "__uncategorized__" : String(group.value)}
                groupValue={group.value ?? null}
                groupLabel={group.label}
                rows={group.rows}
                columns={columns}
                groupColumn={groupColumn}
                pluginManager={pluginManager}
                theme={theme}
                readonly={readonly}
                onCardClick={handleOpenRowDetail}
                onAddCard={config?.allowAddRow !== false ? handleAddCard : undefined}
                onMoveCard={projection.canReorder ? handleMoveCard : undefined}
                onChangeCardGroup={handleChangeCardGroup}
                onToggleDone={handleToggleDone}
                onMoveColumn={handleMoveColumn}
                onDeleteCard={config?.allowDeleteRow !== false ? handleDeleteCard : undefined}
                doneColumnId={cardDisplay.doneColumnId}
                visibleFieldIds={cardDisplay.visibleFieldIds}
                showFieldLabels={cardDisplay.showFieldLabels}
                index={index}
              />
            ))}
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

        {/* 列编辑弹窗 */}
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
          title="删除卡片"
          impact="确定要删除该卡片吗？"
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

KanbanView.displayName = "KanbanView";

export default KanbanView;
