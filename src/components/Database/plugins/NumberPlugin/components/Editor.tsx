import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatNumber, parseNumber } from "../utils/numberUtils";
import EditText from "@/components/EditText";
import { useMemoizedFn, useUnmount } from "ahooks";

interface NumberEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
}

const NumberEditor: React.FC<NumberEditorProps> = memo(
  ({ value, column, onCellValueChange, onFinishEdit }) => {
    const config = column.config as {
      precision?: number;
      min?: number;
      max?: number;
    };

    const initialValue =
      value !== null && value !== undefined ? String(value) : "";

    const handleChange = useMemoizedFn((value: string) => {
      const parsedNumber = parseNumber(formatNumber(value, config));
      onCellValueChange(parsedNumber);
    });

    useUnmount(() => {
      onFinishEdit();
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
          className="w-full h-full px-2 py-2 flex items-center"
        />
      </div>
    );
  },
);

export default NumberEditor;
