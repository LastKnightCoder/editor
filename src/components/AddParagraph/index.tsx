import styles from './index.module.less';
import { CustomElement } from "../../types";
import React from "react";
import {insertParagraphAndFocus} from "../../utils";
import {useSlate} from "slate-react";

interface IAddParagraphProps {
  element: CustomElement
}

const AddParagraph: React.FC<IAddParagraphProps> = (props) => {
  const { element } = props;
  const editor = useSlate();

  const handleAddParagraph = () => {
    insertParagraphAndFocus(editor, element);
  }

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} onClick={handleAddParagraph} className={styles.addParagraph}></div>
  )
}

export default AddParagraph;