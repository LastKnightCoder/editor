import React from 'react'
import { RenderElementProps } from "slate-react";

import styles from './index.module.less';

// import Draggable from "../Draggable";
import {ParagraphElement} from "../../types";

interface IParagraphProps {
  attributes: RenderElementProps['attributes'];
  element: ParagraphElement;
}

const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = (props) => {
  const {
    children,
    attributes,
    // element,
  } = props;

  return (
    <p {...attributes} className={styles.paragraph}>
      {children}
    </p>
    // <Draggable item={element}>
    //   <p {...attributes} className={styles.paragraph}>
    //     {children}
    //   </p>
    // </Draggable>
  )
}

export default Paragraph;
