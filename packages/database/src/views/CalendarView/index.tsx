import React, { memo, useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import { useDatabaseStore, useRowDetail } from "../../hooks";
import PluginManager from "../../PluginManager";
import { RowData, ColumnDef, DatabaseConfig } from "../../types";
import { DateValue, DatePluginConfig } from "../../plugins/DatePlugin";
import MonthGrid from "./MonthGrid";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";
import { Button, ConfirmDialog, cn } from "@tau/ui";

interface CalendarViewProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onRowDetailOpen?: (row: RowData) => void;
  onRowAdd?: (defaultData?: Partial<RowData>) => void;
  onRowDelete?: (rowId: string) => void | Promise<void>;
  config?: DatabaseConfig;
  /** 铺在页面纸上：工具栏左右内距对齐页签条（px-8） */
  bare?: boolean;
}

const CalendarView: React.FC<CalendarViewProps> = memo(
  ({
    pluginManager,
    theme,
    readonly,
    onRowDetailOpen,
    onRowAdd,
    onRowDelete,
    config,
    bare = false,
  }) => {
    const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);

    const { columns, viewConfig, addRow, addColumn, editColumn, columnWidths, deleteRow } =
      useDatabaseStore(state => ({
        columns: state.columns,
        viewConfig: state.viewConfig,
        addRow: state.addRow,
        addColumn: state.addColumn,
        editColumn: state.editColumn,
        columnWidths: state.columnWidths,
        deleteRow: state.deleteRow,
      }));

    const [currentDate, setCurrentDate] = useState(Date.now());
    const { detailRowId, openRowDetail, showRowDetail, closeRowDetail } =
      useRowDetail(onRowDetailOpen);
    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

    const projection = useDatabaseStore(state => state.projection);
    const groupedRows = projection.groups;

    // 获取日历视图配置的日期列
    const calendarConfig = viewConfig.calendarConfig;
    const dateColumnId = calendarConfig?.dateColumnId;

    // 找到日期列
    const dateColumn = useMemo(() => {
      if (dateColumnId) {
        return columns.find(col => col.id === dateColumnId);
      }
      // 如果没有配置，使用第一个日期类型的列
      return columns.find(col => col.type === "date");
    }, [columns, dateColumnId]);

    // 获取主列
    const primaryColumn = columns.find(col => col.isPrimary);

    // 转换 rows 为日历事件格式
    const calendarEvents = useMemo(() => {
      if (!dateColumn) return [];

      // 获取日期列的配置
      const dateConfig = dateColumn.config as DatePluginConfig | undefined;
      const isRange = dateConfig?.isRange || false;

      // 合并所有分组的行
      const allRows = groupedRows.flatMap(group => group.rows);

      return allRows
        .map(row => {
          const dateValue = row[dateColumn.id] as DateValue;

          // 过滤掉没有有效日期的行
          if (!dateValue || typeof dateValue !== "object" || dateValue.start === null) {
            return null;
          }

          const title = primaryColumn ? String(row[primaryColumn.id] || "未命名") : "未命名";

          // 如果日期列配置为不包含结束日期，则使用 startDate 作为 endDate
          const endDate = isRange ? dateValue.end : dateValue.start;

          return {
            id: row.id,
            title,
            startDate: dateValue.start,
            endDate,
            color: "var(--tau-accent)",
            rowData: row,
          };
        })
        .filter((event): event is NonNullable<typeof event> => event !== null);
    }, [dateColumn, groupedRows, primaryColumn]);

    const currentYear = dayjs(currentDate).year();
    const currentMonth = dayjs(currentDate).month() + 1;

    const handlePreviousMonth = useMemoizedFn(() => {
      setCurrentDate(dayjs(currentDate).subtract(1, "month").valueOf());
    });

    const handleNextMonth = useMemoizedFn(() => {
      setCurrentDate(dayjs(currentDate).add(1, "month").valueOf());
    });

    const handleToday = useMemoizedFn(() => {
      setCurrentDate(Date.now());
    });

    const handleEventClick = openRowDetail;

    const handleDateClick = useMemoizedFn((date: number) => {
      if (readonly || !dateColumn) return;

      // 创建新行数据，设置日期列的值
      const newRowData: Partial<RowData> = {};
      newRowData[dateColumn.id] = {
        start: date,
        end: date,
      } as DateValue;

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

    const handleDateRangeSelect = useMemoizedFn((startDate: number, endDate: number) => {
      if (readonly || !dateColumn) return;

      // 获取日期列的配置
      const dateConfig = dateColumn.config as DatePluginConfig | undefined;
      const isRange = dateConfig?.isRange || false;

      // 创建新行数据，设置日期列的值
      const newRowData: Partial<RowData> = {};
      newRowData[dateColumn.id] = {
        start: startDate,
        end: isRange ? endDate : startDate,
      } as DateValue;

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

    const handleDeleteRow = useMemoizedFn((rowId: string) => {
      if (onRowDelete) {
        onRowDelete(rowId);
      } else {
        setConfirmDeleteRowId(rowId);
      }
    });

    const handleEventDelete = useMemoizedFn((rowData: RowData) => handleDeleteRow(rowData.id));

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

    // 如果没有日期列，显示提示
    if (!dateColumn) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-ink-2 mb-4">日历视图需要至少一个日期类型的列</p>
            {!readonly && (
              <Button variant="primary" size="sm" onClick={handleAddColumn}>
                添加日期列
              </Button>
            )}
          </div>
          {columnEditOpen && (
            <ColumnEditModal
              open={columnEditOpen}
              column={null}
              onCancel={() => setColumnEditOpen(false)}
              onSave={handleSaveColumn}
              theme={theme}
              pluginManager={pluginManager}
            />
          )}
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col">
        {/* 顶部工具栏 */}
        <div
          className={cn(
            "border-line-2 flex items-center justify-between border-b py-2.5",
            bare ? "pl-8 pr-7" : "px-4"
          )}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={handlePreviousMonth}
              className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-full transition-colors"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={handleNextMonth}
              className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-full transition-colors"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <Button variant="secondary" size="sm" onClick={handleToday} className="ml-1">
              今天
            </Button>
          </div>
          <h2 className="text-ink-1 text-tau-title-lg font-semibold">
            {currentYear}年{currentMonth}月
          </h2>
          <div className="w-32" /> {/* 占位，保持标题居中 */}
        </div>

        {/* 月视图网格 */}
        <div className="flex-1 overflow-hidden">
          <MonthGrid
            year={currentYear}
            month={currentMonth}
            events={calendarEvents}
            theme={theme}
            readonly={readonly}
            dateConfig={dateColumn?.config as DatePluginConfig}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
            onDateRangeSelect={handleDateRangeSelect}
            onEventDelete={handleEventDelete}
          />
        </div>

        {detailRowId && (
          <RowDetailModal
            rowId={detailRowId}
            columns={columns}
            pluginManager={pluginManager}
            theme={theme}
            onClose={closeRowDetail}
            onDeleteRow={config?.allowDeleteRow !== false ? handleDeleteRow : undefined}
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
          title="确定删除此事件吗？"
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
CalendarView.displayName = "CalendarView";

export default CalendarView;
