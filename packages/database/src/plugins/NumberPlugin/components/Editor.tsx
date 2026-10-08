import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatNumber, parseNumber } from "../utils/numberUtils";
import { EditText } from "@tau/ui";
import { useMemoizedFn, useUnmount } from "ahooks";

interface NumberEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: (restoreFocus?: boolean) => void;
}

const NumberEditor: React.FC<NumberEditorProps> = memo(
  ({ value, column, onCellValueChange, onFinishEdit }) => {
    const config = column.config as {
      precision?: number;
      min?: number;
      max?: number;
    };

    const initialValue = value !== null && value !== undefined ? String(value) : "";

    const handleChange = useMemoizedFn((value: string) => {
      const parsedNumber = parseNumber(formatNumber(value, config));
      onCellValueChange(parsedNumber);
    });

    useUnmount(() => {
      onFinishEdit();
    });

    return (
      <div className="relative h-full w-full">
        <EditText
          defaultFocus={true}
          defaultValue={formatNumber(initialValue, config)}
          contentEditable={true}
          onChange={handleChange}
          onBlur={onFinishEdit}
          onPressEnter={() => onFinishEdit(true)}
          className="flex h-full w-full items-center px-2 py-2"
          isSlateEditor
        />
      </div>
    );
  }
);

export default NumberEditor;
