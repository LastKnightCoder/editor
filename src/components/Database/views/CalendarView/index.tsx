import React, { memo, useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { App } from "antd";
import dayjs from "dayjs";
import { useDatabaseStore } from "../../hooks";
import { useFilteredAndSortedRows } from "../../hooks/useFilteredAndSortedRows";
import PluginManager from "../../PluginManager";
import { RowData, ColumnDef } from "../../types";
import { DateValue, DatePluginConfig } from "../../plugins/DatePlugin";
import MonthGrid from "./MonthGrid";
import RowDetailModal from "../../components/RowDetailModal";
import ColumnEditModal from "../TableView/components/ColumnEditModal";

interface CalendarViewProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
}

const CalendarView: React.FC<CalendarViewProps> = memo(
  ({ pluginManager, theme, readonly }) => {
    const { modal } = App.useApp();

    const {
      columns,
      rows,
      viewConfig,
      updateCellValue,
      addRow,
      addColumn,
      editColumn,
      columnWidths,
      deleteRow,
    } = useDatabaseStore((state) => ({
      columns: state.columns,
      rows: state.rows,
      viewConfig: state.viewConfig,
      updateCellValue: state.updateCellValue,
      addRow: state.addRow,
      addColumn: state.addColumn,
      editColumn: state.editColumn,
      columnWidths: state.columnWidths,
      deleteRow: state.deleteRow,
    }));

    const [currentDate, setCurrentDate] = useState(Date.now());
    const [rowDetailOpen, setRowDetailOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<RowData | null>(null);
    const [columnEditOpen, setColumnEditOpen] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

    const { groupedRows } = useFilteredAndSortedRows(
      rows,
      columns,
      viewConfig,
      pluginManager,
    );

    // 获取日历视图配置的日期列
    const calendarConfig = viewConfig.calendarConfig;
    const dateColumnId = calendarConfig?.dateColumnId;

    // 找到日期列
    const dateColumn = useMemo(() => {
      if (dateColumnId) {
        return columns.find((col) => col.id === dateColumnId);
      }
      // 如果没有配置，使用第一个日期类型的列
      return columns.find((col) => col.type === "date");
    }, [columns, dateColumnId]);

    // 获取主列
    const primaryColumn = columns.find((col) => col.isPrimary);

    // 转换 rows 为日历事件格式
    const calendarEvents = useMemo(() => {
      if (!dateColumn) return [];

      // 获取日期列的配置
      const dateConfig = dateColumn.config as DatePluginConfig | undefined;
      const isRange = dateConfig?.isRange || false;

      // 合并所有分组的行
      const allRows = groupedRows.flatMap((group) => group.rows);

      return allRows
        .map((row) => {
          const dateValue = row[dateColumn.id] as DateValue;

          // 过滤掉没有有效日期的行
          if (
            !dateValue ||
            typeof dateValue !== "object" ||
            dateValue.start === null
          ) {
            return null;
          }

          const title = primaryColumn
            ? String(row[primaryColumn.id] || "未命名")
            : "未命名";

          // 如果日期列配置为不包含结束日期，则使用 startDate 作为 endDate
          const endDate = isRange ? dateValue.end : dateValue.start;

          return {
            id: row.id,
            title,
            startDate: dateValue.start,
            endDate,
            color: "#3b82f6", // 默认蓝色
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

    const handleEventClick = useMemoizedFn((rowData: RowData) => {
      setEditingRow(rowData);
      setRowDetailOpen(true);
    });

    const handleDateClick = useMemoizedFn((date: number) => {
      if (readonly || !dateColumn) return;

      // 创建新行，设置日期列的值
      const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newRowData: Partial<RowData> = {
        id: newId,
      };

      // 设置日期列的值
      newRowData[dateColumn.id] = {
        start: date,
        end: date,
      } as DateValue;

      // 添加到 store
      addRow(newRowData);

      // 构建完整的新行对象用于打开详情弹窗
      const newRow: RowData = {
        id: newId,
      };
      columns.forEach((column) => {
        newRow[column.id] = newRowData[column.id] ?? null;
      });

      // 立即打开新行的详情弹窗
      handleEventClick(newRow);
    });

    const handleDateRangeSelect = useMemoizedFn(
      (startDate: number, endDate: number) => {
        if (readonly || !dateColumn) return;

        // 获取日期列的配置
        const dateConfig = dateColumn.config as DatePluginConfig | undefined;
        const isRange = dateConfig?.isRange || false;

        // 创建新行，设置日期列的值
        const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newRowData: Partial<RowData> = {
          id: newId,
        };

        // 如果日期列不支持范围，只使用开始日期
        newRowData[dateColumn.id] = {
          start: startDate,
          end: isRange ? endDate : startDate,
        } as DateValue;

        // 添加到 store
        addRow(newRowData);

        // 构建完整的新行对象用于打开详情弹窗
        const newRow: RowData = {
          id: newId,
        };
        columns.forEach((column) => {
          newRow[column.id] = newRowData[column.id] ?? null;
        });

        // 立即打开新行的详情弹窗
        handleEventClick(newRow);
      },
    );

    const handleEventDelete = useMemoizedFn((rowData: RowData) => {
      modal.confirm({
        title: "确定删除此事件吗？",
        okButtonProps: { danger: true },
        onOk: () => {
          deleteRow(rowData.id);
        },
      });
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

    // 如果没有日期列，显示提示
    if (!dateColumn) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              日历视图需要至少一个日期类型的列
            </p>
            {!readonly && (
              <button
                onClick={handleAddColumn}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                添加日期列
              </button>
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
      <div className="w-full h-full flex flex-col">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousMonth}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <MdChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <MdChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              今天
            </button>
          </div>
          <h2 className="text-lg font-semibold">
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
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
            onDateRangeSelect={handleDateRangeSelect}
            onEventDelete={handleEventDelete}
          />
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
CalendarView.displayName = "CalendarView";

export default CalendarView;
