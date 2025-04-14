import React, { useEffect, memo } from "react";
import { DatePicker } from "antd";
import { CellValue, ColumnDef } from "../../../../types";
import dayjs from "dayjs";
import useTheme from "../../../../../../hooks/useTheme";
import styles from "./index.module.less";

/**
 * 日期单元格编辑器组件
 */
interface DateEditorProps {
  value: CellValue;
  config?: any;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onBlur: () => void;
}

const DateEditor: React.FC<DateEditorProps> = memo(
  ({ value, onCellValueChange, onBlur }) => {
    const { isDark } = useTheme();
    const dateValue = value ? dayjs(value as string | Date) : null;

    // 挂载时聚焦日期选择器
    useEffect(() => {
      const pickerInput = document.querySelector(
        `.${styles.editor} .ant-picker-input input`,
      );
      if (pickerInput) {
        (pickerInput as HTMLElement).focus();
      }
    }, []);

    // 处理日期变更
    const handleChange = (date: dayjs.Dayjs | null) => {
      onCellValueChange(date ? date.toDate() : null);
    };

    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        onBlur();
      } else if (e.key === "Escape") {
        onCellValueChange(value); // 还原为原始值
        onBlur();
      }
    };

    return (
      <div className={`${styles.editor} ${isDark ? "dark" : ""}`}>
        <DatePicker
          value={dateValue}
          onChange={handleChange}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          allowClear
          format="YYYY-MM-DD"
          inputReadOnly={false}
          autoFocus
        />
      </div>
    );
  },
);

export default DateEditor;
