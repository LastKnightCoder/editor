import React from 'react'
import { RenderElementProps } from "slate-react";
import classnames from 'classnames';
import { MdDragIndicator } from "react-icons/md";

import { ParagraphElement } from "@/components/Editor/types";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import styles from './index.module.less';

interface IParagraphProps {
  attributes: RenderElementProps['attributes'];
  element: ParagraphElement;
}

const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = (props) => {
  const {
    children,
    attributes,
    element,
  } = props;

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
  });

  return (
    <div ref={drop} className={styles.container}>
      <p {...attributes} className={classnames(styles.paragraph, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
      >
        {children}
      </p>
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default Paragraph;
