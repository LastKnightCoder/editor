import React, { useState, useRef, useEffect, memo } from "react";
import { CellValue, ColumnDef } from "../../../../types";
import { parseDate, formatDateForInput } from "../../utils/dateUtils";
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
    // 为输入字段格式化日期为YYYY-MM-DD
    const initialDate = formatDateForInput(value as Date | string | null);
    const [inputValue, setInputValue] = useState(initialDate);
    const inputRef = useRef<HTMLInputElement>(null);

    // 挂载时聚焦输入框
    useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    // 处理输入变化
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);

      // 解析日期并更新（如果有效）
      const parsedDate = parseDate(newValue);
      onCellValueChange(parsedDate);
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
      <input
        ref={inputRef}
        type="date"
        value={inputValue}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        className={styles.editor}
      />
    );
  },
);

export default DateEditor;
