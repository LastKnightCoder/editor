import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../../types";
import { formatNumber, parseNumber } from "../../utils/numberUtils";
import styles from "./index.module.less";
import EditText from "@/components/EditText";
import { useMemoizedFn } from "ahooks";

/**
 * 数字单元格编辑器组件
 */
interface NumberEditorProps {
  value: CellValue;
  config?: {
    precision?: number;
    min?: number;
    max?: number;
  };
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onBlur: () => void;
}

const NumberEditor: React.FC<NumberEditorProps> = memo(
  ({ value, config, onCellValueChange, onBlur }) => {
    // 将数字转换为字符串用于输入
    const initialValue =
      value !== null && value !== undefined ? String(value) : "";

    // 处理输入变化
    const handleChange = useMemoizedFn((value: string) => {
      // 解析为数字
      const parsedNumber = parseNumber(formatNumber(value, config));
      onCellValueChange(parsedNumber);
    });

    // 处理键盘事件
    const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onBlur();
        return true;
      } else if (e.key === "Escape") {
        onCellValueChange(value); // 还原为原始值
        onBlur();
        return true;
      }
      return false;
    });

    return (
      <EditText
        defaultFocus={true}
        defaultValue={formatNumber(initialValue, config)}
        contentEditable={true}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        className={styles.editor}
      />
    );
  },
);

export default NumberEditor;
