import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../../types";
import styles from "./index.module.less";
import EditText from "@/components/EditText";

interface TextEditorProps {
  value: CellValue;
  config?: any;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onBlur: () => void;
}

const TextEditor: React.FC<TextEditorProps> = memo(
  ({ value, onCellValueChange, onBlur }) => {
    return (
      <div className={styles.editorContainer}>
        <EditText
          defaultValue={value?.toString() || ""}
          onChange={onCellValueChange}
          onBlur={onBlur}
          onPressEnter={onBlur}
          contentEditable={true}
          defaultFocus={true}
          className={styles.editor}
        />
      </div>
    );
  },
);

export default TextEditor;
