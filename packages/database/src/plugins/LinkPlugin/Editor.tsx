import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../types";
import { EditText } from "@tau/ui";

interface LinkEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: (restoreFocus?: boolean) => void;
}

const LinkEditor: React.FC<LinkEditorProps> = memo(({ value, onCellValueChange, onFinishEdit }) => {
  return (
    <div className="relative min-h-10 w-full">
      <EditText
        defaultValue={value?.toString() || ""}
        onChange={onCellValueChange}
        onBlur={onFinishEdit}
        onPressEnter={() => onFinishEdit(true)}
        contentEditable={true}
        defaultFocus={true}
        className="flex min-h-10 w-full items-center px-2 py-2 text-sm"
        isSlateEditor
      />
    </div>
  );
});

export default LinkEditor;
