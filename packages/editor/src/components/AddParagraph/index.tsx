import React, { forwardRef, useImperativeHandle } from "react";
import { useSlateStatic, useReadOnly } from "slate-react";

import { CustomElement } from "../../types";
import { insertParagraphAndFocus } from "../../utils";
import { useMemoizedFn } from "ahooks";

interface IAddParagraphProps {
  element: CustomElement;
  onAddParagraph?: () => void;
}

export interface AddParagraphRef {
  addParagraph: () => void;
}

const AddParagraph = forwardRef<AddParagraphRef, IAddParagraphProps>(
  (props, ref) => {
    const { element, onAddParagraph } = props;
    const editor = useSlateStatic();
    const readOnly = useReadOnly();

    useImperativeHandle(ref, () => ({
      addParagraph: () => {
        if (readOnly) return;
        insertParagraphAndFocus(editor, element);
        onAddParagraph?.();
      },
    }));

    const handleAddParagraph = useMemoizedFn((e: React.MouseEvent) => {
      if (readOnly) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      insertParagraphAndFocus(editor, element);
      onAddParagraph?.();
    });

    return (
      <div
        contentEditable={false}
        style={{ userSelect: "none" }}
        onClick={handleAddParagraph}
        className={`h-(--block-distance) select-none ${readOnly ? "cursor-default" : "cursor-pointer"}`}
      >
        {/* 导出的时候无法导出，设置一个零宽字符字符就可以导出了 */}
        {"\uFEFF"}
      </div>
    );
  },
);

export default AddParagraph;
