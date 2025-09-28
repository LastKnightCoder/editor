import React, { memo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { CellValue, ColumnDef } from "../../../types";
import EditText from "@/components/EditText";

interface TextEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
}

const TextEditor: React.FC<TextEditorProps> = memo(
  ({ value, onCellValueChange, onFinishEdit }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const handleWheel = useMemoizedFn((e: React.WheelEvent<HTMLDivElement>) => {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft += e.deltaY;
      }
    });

    return (
      <div
        className="w-full h-full relative overflow-x-auto scrollbar-hide"
        ref={scrollRef}
        onWheel={handleWheel}
      >
        <EditText
          defaultValue={value?.toString() || ""}
          onChange={onCellValueChange}
          onBlur={onFinishEdit}
          onPressEnter={onFinishEdit}
          contentEditable={true}
          defaultFocus={true}
          className="w-full h-full px-2 py-2 flex items-center whitespace-nowrap"
          isSlateEditor
        />
      </div>
    );
  },
);

export default TextEditor;
