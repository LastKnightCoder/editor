import styles from './index.module.less';
import { CustomElement } from "../../types";
import React from "react";
import {insertParagraphAndFocus} from "../../utils";
import {useSlate, useReadOnly} from "slate-react";

interface IAddParagraphProps {
  element: CustomElement
}

const AddParagraph: React.FC<IAddParagraphProps> = (props) => {
  const { element } = props;
  const editor = useSlate();
  const readOnly = useReadOnly();

  const handleAddParagraph = () => {
    if (readOnly) {
      return;
    }
    insertParagraphAndFocus(editor, element);
  }

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} onClick={handleAddParagraph} className={styles.addParagraph}></div>
  )
}

export default AddParagraph;