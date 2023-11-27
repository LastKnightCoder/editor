import React, { useState, useRef } from 'react';
import { Transforms } from "slate";
import { RenderElementProps, useSlate, useReadOnly, ReactEditor } from "slate-react";
import classnames from 'classnames';
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import { CalloutElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import styles from './index.module.less';
import {MdDragIndicator} from "react-icons/md";

interface ICalloutProps {
  attributes: RenderElementProps['attributes'];
  element: CalloutElement;
}

const configs = {
  tip: {
    title: 'TIP',
  },
  info: {
    title: 'INFO',
  },
  warning: {
    title: 'WARNING',
  },
  danger: {
    title: 'DANGER',
  },
  note: {
    title: 'NOTE',
  }
}

const Callout: React.FC<React.PropsWithChildren<ICalloutProps>> = (props) => {
  const { attributes, element, children } = props;
  const { calloutType, title } = element;
  const { title: defaultTitle } = configs[calloutType];
  const editor = useSlate();
  const readOnly = useReadOnly();
  const [realTitle, setRealTitle] = useState<string>(title || defaultTitle);
  const titleRef = useRef<HTMLParagraphElement>(null);

  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    element,
  });

  const handleTitleBlur = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: titleRef.current?.innerText }, { at: path });
    setRealTitle(titleRef.current?.innerText || defaultTitle);
  }

  return (
    <div ref={drop} className={styles.container}>
      <div className={classnames(styles.callout, styles[calloutType], {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}>
        <div
          contentEditable={false}
          style={{ userSelect: 'none' }}
        >
          <p
            data-slate-editor
            ref={titleRef}
            onBlur={handleTitleBlur}
            className={styles.title}
            // @ts-ignore
            contentEditable={!readOnly ? 'plaintext-only' : false}
            suppressContentEditableWarning
          >
            {realTitle}
          </p>
        </div>
        <div {...attributes}>
          {children}
        </div>
      </div>
      <AddParagraph element={element} />
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default Callout;