import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import EditText from "@/components/EditText";

interface TextEditorProps {
  value: CellValue;
  config?: any;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
}

const TextEditor: React.FC<TextEditorProps> = memo(
  ({ value, onCellValueChange, onFinishEdit }) => {
    return (
      <div className="w-full h-full relative">
        <EditText
          defaultValue={value?.toString() || ""}
          onChange={onCellValueChange}
          onBlur={onFinishEdit}
          onPressEnter={onFinishEdit}
          contentEditable={true}
          defaultFocus={true}
          className="w-full h-full px-4 py-2 flex items-center"
        />
      </div>
    );
  },
);

export default TextEditor;
