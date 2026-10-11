import React, { memo, useState, useMemo, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { useDatabaseStore, useRowDetail } from "../../hooks";
import { RowData, ColumnDef, CellValue, SelectOption, KanbanViewConfig } from "../../types";
import { getViewOptions } from "../../core/viewOptions";
import KanbanColumn from "./KanbanColumn";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";
import { cn, ConfirmDialog } from "@tau/ui";
import { v4 as uuidv4 } from "uuid";
import { resolveKanbanCardDisplay } from "./cardDisplayConfig";
import type { DatabaseViewComponentProps } from "../types";

type KanbanViewProps = DatabaseViewComponentProps;

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
      setViewOptions,
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
      setViewOptions: state.setViewOptions,
      deleteRow: state.deleteRow,
    }));

    const { detailRowId, openRowDetail, showRowDetail, closeRowDetail } =
      useRowDetail(onRowDetailOpen);
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
    const kanban = getViewOptions<KanbanViewConfig>(viewConfig, "kanban");
    const groupColumnId = kanban?.groupColumnId;

    // 获取分组列
    const groupColumn = useMemo(() => {
      return columns.find(col => col.id === groupColumnId);
    }, [columns, groupColumnId]);
    const primaryColumn = useMemo(() => columns.find(column => column.isPrimary), [columns]);
    const isBooleanColumn = useMemoizedFn((column: ColumnDef) =>
      pluginManager.hasCapability(column.type, "boolean")
    );
    const cardDisplay = useMemo(
      () =>
        resolveKanbanCardDisplay({
          columns,
          viewConfig,
          kanban,
          primaryColumnId: primaryColumn?.id,
          groupColumnId,
          isBooleanColumn,
        }),
      [columns, viewConfig, kanban, primaryColumn?.id, groupColumnId, isBooleanColumn]
    );

    const projection = useDatabaseStore(state => state.projection);
    const groupedData = projection.groups;

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
        showRowDetail(newId);
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
        if (!groupColumn || !pluginManager.hasCapability(groupColumn.type, "singleOption")) return;

        const selectConfig = groupColumn.config as { options?: SelectOption[] };
        const options = selectConfig?.options || [];

        // 获取当前的 columnOrder
        const currentOrder = kanban?.columnOrder || options.map(opt => opt.id);

        // 找到拖拽和悬停的索引
        const dragIndex = currentOrder.indexOf(String(dragGroupValue));
        const hoverIndex = currentOrder.indexOf(String(hoverGroupValue));

        if (dragIndex === -1 || hoverIndex === -1) return;

        // 重新排序
        const newOrder = [...currentOrder];
        const [removed] = newOrder.splice(dragIndex, 1);
        newOrder.splice(hoverIndex, 0, removed);

        setViewOptions("kanban", {
          ...kanban,
          groupColumnId: groupColumn.id,
          columnOrder: newOrder,
        });
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

    if (!groupColumn || !pluginManager.hasCapability(groupColumn.type, "singleOption")) {
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
        {/* 横向滚动条常显：全局滚动条样式（@tau/ui styles.css）未分层且滑块默认透明，只在纵向
            可滚容器上自动显形，横向看板永远不显形，故用 important 覆盖。轨道左右让出卡片内边距，
            容器底部留白让滚动条不贴卡片底边 */}
        <div
          className={cn(
            "mb-2.5 min-h-0 flex-1 overflow-x-auto overflow-y-hidden",
            "[&::-webkit-scrollbar]:h-1! [&::-webkit-scrollbar-track]:mx-4",
            "[&::-webkit-scrollbar-thumb]:bg-track! [&::-webkit-scrollbar-thumb:hover]:bg-sunken! [&::-webkit-scrollbar-thumb]:rounded-full!"
          )}
          ref={scrollParentRef}
        >
          <div className="flex h-full w-max gap-2 px-2 pb-2 pt-3">
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
                onCardClick={openRowDetail}
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

        {detailRowId && (
          <RowDetailModal
            rowId={detailRowId}
            columns={columns}
            pluginManager={pluginManager}
            theme={theme}
            onClose={closeRowDetail}
            onDeleteRow={config?.allowDeleteRow !== false ? handleDeleteCard : undefined}
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
