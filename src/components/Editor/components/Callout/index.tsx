import React, { useState, useRef } from 'react';
import classnames from 'classnames';
import styles from './index.module.less';
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";
import { CalloutElement } from "../../types";
import AddParagraph from "../AddParagraph";
import {Transforms} from "slate";

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
  const [realTitle, setRealTitle] = useState<string>(title || defaultTitle);
  const titleRef = useRef<HTMLParagraphElement>(null);

  const handleTitleBlur = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: titleRef.current?.innerText }, { at: path });
    setRealTitle(titleRef.current?.innerText || defaultTitle);
  }

  return (
    <div>
      <div className={classnames(styles.callout, styles[calloutType])}>
        <div
          contentEditable={false}
          style={{ userSelect: 'none' }}
        >
          <p
            data-slate-editor
            ref={titleRef}
            onBlur={handleTitleBlur}
            className={styles.title}
            contentEditable
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
    </div>
  )
}

export default Callout;