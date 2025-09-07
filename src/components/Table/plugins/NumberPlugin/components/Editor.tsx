import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatNumber, parseNumber } from "../utils/numberUtils";
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
  onFinishEdit: () => void;
}

const NumberEditor: React.FC<NumberEditorProps> = memo(
  ({ value, config, onCellValueChange, onFinishEdit }) => {
    // 将数字转换为字符串用于输入
    const initialValue =
      value !== null && value !== undefined ? String(value) : "";

    // 处理输入变化
    const handleChange = useMemoizedFn((value: string) => {
      // 解析为数字
      const parsedNumber = parseNumber(formatNumber(value, config));
      onCellValueChange(parsedNumber);
    });

    return (
      <div className="w-full h-full relative">
        <EditText
          defaultFocus={true}
          defaultValue={formatNumber(initialValue, config)}
          contentEditable={true}
          onChange={handleChange}
          onBlur={onFinishEdit}
          onPressEnter={onFinishEdit}
          className="w-full h-full px-4 py-2 flex items-center"
        />
      </div>
    );
  },
);

export default NumberEditor;
