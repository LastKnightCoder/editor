import React from 'react'
import styles from './index.module.less';
import {RenderElementProps} from "slate-react";
import {ParagraphElement} from "../../types";

interface IParagraphProps {
  attributes: RenderElementProps['attributes'];
  element: ParagraphElement;
}

const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = (props) => {
  const { children, attributes } = props;

  return (
    <p {...attributes} className={styles.paragraph}>
      {children}
    </p>
  )
}

export default Paragraph;
