import React from "react";
import classnames from 'classnames';
import { useSlate, useReadOnly } from "slate-react";

import { CustomElement } from "../../types";
import { insertParagraphAndFocus } from "../../utils";
import styles from './index.module.less';


interface IAddParagraphProps {
  element: CustomElement
}

const AddParagraph: React.FC<IAddParagraphProps> = (props) => {
  const { element } = props;
  const editor = useSlate();
  const readOnly = useReadOnly();

  const handleAddParagraph = (e: React.MouseEvent) => {
    if (readOnly) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    insertParagraphAndFocus(editor, element);
  }

  return (
    <div
      contentEditable={false}
      style={{ userSelect: 'none' }}
      onClick={handleAddParagraph}
      className={classnames(styles.addParagraph, { [styles.pointer]: !readOnly })}>
    </div>
  )
}

export default AddParagraph;