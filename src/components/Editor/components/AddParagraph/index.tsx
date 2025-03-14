import React, { forwardRef, useImperativeHandle } from "react";
import classnames from "classnames";
import { useSlate, useReadOnly } from "slate-react";

import { CustomElement } from "../../types";
import { insertParagraphAndFocus } from "../../utils";
import styles from "./index.module.less";
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
    const editor = useSlate();
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
        className={classnames(styles.addParagraph, {
          [styles.pointer]: !readOnly,
        })}
      ></div>
    );
  },
);

export default AddParagraph;
