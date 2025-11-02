import React, { memo, useState, useMemo } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useMemoizedFn } from "ahooks";
import { useDatabaseStore } from "../../hooks";
import { useFilteredAndSortedRows } from "../../hooks/useFilteredAndSortedRows";
import PluginManager from "../../PluginManager";
import { RowData, ColumnDef, CellValue, SelectOption } from "../../types";
import KanbanColumn from "./KanbanColumn";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";

interface KanbanViewProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
}

interface GroupedData {
  groupValue: CellValue;
  label: string;
  rows: RowData[];
}

const KanbanView: React.FC<KanbanViewProps> = memo(
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
      moveRow,
    } = useDatabaseStore((state) => ({
      columns: state.columns,
      rows: state.rows,
      viewConfig: state.viewConfig,
      addRow: state.addRow,
      updateCellValue: state.updateCellValue,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      columnWidths: state.columnWidths,
      moveRow: state.moveRow,
    }));

    const [rowDetailOpen, setRowDetailOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<RowData | null>(null);
    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

    // 获取看板配置
    const kanbanConfig = viewConfig.kanbanConfig;
    const groupColumnId = kanbanConfig?.groupColumnId;

    // 获取分组列
    const groupColumn = useMemo(() => {
      return columns.find((col) => col.id === groupColumnId);
    }, [columns, groupColumnId]);

    // 使用过滤和排序（但不使用分组，因为看板有自己的分组逻辑）
    const { orderedRows } = useFilteredAndSortedRows(
      rows,
      columns,
      { ...viewConfig, groupBy: null }, // 忽略 groupBy 设置
      pluginManager,
    );

    // 根据单选列的值将行分组
    const groupedData = useMemo<GroupedData[]>(() => {
      if (!groupColumn || groupColumn.type !== "select") {
        return [];
      }

      // 获取单选列的选项配置
      const selectConfig = groupColumn.config as { options?: SelectOption[] };
      const options = selectConfig?.options || [];

      // 创建分组 Map
      const groupsMap = new Map<string, RowData[]>();

      // 初始化所有选项的分组
      options.forEach((option) => {
        groupsMap.set(option.id, []);
      });

      // 初始化未分类组
      groupsMap.set("__uncategorized__", []);

      // 将行分配到各个组
      orderedRows.forEach((row) => {
        const value = row[groupColumnId!];
        if (value === null || value === undefined || value === "") {
          groupsMap.get("__uncategorized__")?.push(row);
        } else {
          const groupKey = String(value);
          if (groupsMap.has(groupKey)) {
            groupsMap.get(groupKey)?.push(row);
          } else {
            // 如果选项不存在，放到未分类
            groupsMap.get("__uncategorized__")?.push(row);
          }
        }
      });

      // 构建分组数据，按照 columnOrder 排序（如果有的话）
      const columnOrder = kanbanConfig?.columnOrder;
      let orderedOptions: SelectOption[];

      if (columnOrder && columnOrder.length > 0) {
        // 按照保存的顺序排列
        orderedOptions = columnOrder
          .map((optionId) => options.find((opt) => opt.id === optionId))
          .filter((opt): opt is SelectOption => !!opt);

        // 添加新增的选项（不在 columnOrder 中的）
        options.forEach((opt) => {
          if (!columnOrder.includes(opt.id)) {
            orderedOptions.push(opt);
          }
        });
      } else {
        // 使用默认顺序
        orderedOptions = options;
      }

      const result: GroupedData[] = [];

      // 添加未分类组（如果有数据）
      const uncategorizedRows = groupsMap.get("__uncategorized__") || [];
      if (uncategorizedRows.length > 0) {
        result.push({
          groupValue: null,
          label: "未分类",
          rows: uncategorizedRows,
        });
      }

      // 添加其他分组
      orderedOptions.forEach((option) => {
        const groupRows = groupsMap.get(option.id) || [];
        result.push({
          groupValue: option.id,
          label: option.name,
          rows: groupRows,
        });
      });

      return result;
    }, [groupColumn, orderedRows, groupColumnId, kanbanConfig]);

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
      Object.keys(rowData).forEach((key) => {
        if (key !== "id") {
          updateCellValue(editingRow.id, key, rowData[key]);
        }
      });
    });

    const handleAddCard = useMemoizedFn((groupValue: CellValue) => {
      if (!groupColumnId) return;

      const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newRowData: Partial<RowData> = {
        id: newId,
        [groupColumnId]: groupValue,
      };

      addRow(newRowData);

      // 构建完整的新行对象用于打开详情弹窗
      const newRow: RowData = {
        id: newId,
      };
      columns.forEach((column) => {
        newRow[column.id] = newRowData[column.id] ?? null;
      });

      handleOpenRowDetail(newRow);
    });

    const handleMoveCard = useMemoizedFn(
      (dragRowId: string, hoverRowId: string) => {
        const dragIndex = orderedRows.findIndex((r) => r.id === dragRowId);
        const hoverIndex = orderedRows.findIndex((r) => r.id === hoverRowId);
        if (dragIndex !== -1 && hoverIndex !== -1) {
          moveRow(dragIndex, hoverIndex);
        }
      },
    );

    const handleChangeCardGroup = useMemoizedFn(
      (rowId: string, newGroupValue: CellValue) => {
        if (!groupColumnId) return;
        updateCellValue(rowId, groupColumnId, newGroupValue);
      },
    );

    const handleMoveColumn = useMemoizedFn(
      (dragGroupValue: CellValue, hoverGroupValue: CellValue) => {
        // 更新列顺序配置
        if (!groupColumn || groupColumn.type !== "select") return;

        const selectConfig = groupColumn.config as { options?: SelectOption[] };
        const options = selectConfig?.options || [];

        // 获取当前的 columnOrder
        const currentOrder =
          kanbanConfig?.columnOrder || options.map((opt) => opt.id);

        // 找到拖拽和悬停的索引
        const dragIndex = currentOrder.indexOf(String(dragGroupValue));
        const hoverIndex = currentOrder.indexOf(String(hoverGroupValue));

        if (dragIndex === -1 || hoverIndex === -1) return;

        // 重新排序
        const newOrder = [...currentOrder];
        const [removed] = newOrder.splice(dragIndex, 1);
        newOrder.splice(hoverIndex, 0, removed);

        // 更新配置 - 这里需要通过 onUpdateView 保存到后端
        // 由于这是在组件内部，我们需要通过回调来更新
        // 暂时先不实现持久化，等到集成时再处理
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

    if (!groupColumn || groupColumn.type !== "select") {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-lg mb-2">无法显示看板视图</div>
            <div className="text-sm">
              {!groupColumn ? "未配置分组列" : "分组列类型必须是单选类型"}
            </div>
          </div>
        </div>
      );
    }

    return (
      <DndProvider backend={HTML5Backend}>
        <div className="w-full h-full flex flex-col">
          {/* 看板列容器 */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 p-4 h-full">
              {groupedData.map((group, index) => (
                <KanbanColumn
                  key={
                    group.groupValue === null
                      ? "__uncategorized__"
                      : String(group.groupValue)
                  }
                  groupValue={group.groupValue}
                  groupLabel={group.label}
                  rows={group.rows}
                  columns={columns}
                  groupColumn={groupColumn}
                  pluginManager={pluginManager}
                  theme={theme}
                  readonly={readonly}
                  onCardClick={handleOpenRowDetail}
                  onAddCard={handleAddCard}
                  onMoveCard={handleMoveCard}
                  onChangeCardGroup={handleChangeCardGroup}
                  onMoveColumn={handleMoveColumn}
                  index={index}
                />
              ))}
            </div>
          </div>

          {/* 行详情弹窗 */}
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

          {/* 列编辑弹窗 */}
          {columnEditOpen && (
            <ColumnEditModal
              open={columnEditOpen}
              column={
                editingColumnId
                  ? (() => {
                      const found = columns.find(
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
        </div>
      </DndProvider>
    );
  },
);

KanbanView.displayName = "KanbanView";

export default KanbanView;
