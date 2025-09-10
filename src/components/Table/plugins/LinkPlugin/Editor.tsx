import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../types";
import EditText from "@/components/EditText";

interface LinkEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
}

const LinkEditor: React.FC<LinkEditorProps> = memo(
  ({ value, onCellValueChange, onFinishEdit }) => {
    return (
      <div className="w-full min-h-10 relative">
        <EditText
          defaultValue={value?.toString() || ""}
          onChange={onCellValueChange}
          onBlur={onFinishEdit}
          onPressEnter={onFinishEdit}
          contentEditable={true}
          defaultFocus={true}
          className="w-full min-h-10 px-4 py-2 flex items-center"
        />
      </div>
    );
  },
);

export default LinkEditor;
