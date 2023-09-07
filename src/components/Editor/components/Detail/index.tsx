import React, {useRef, useState} from "react";
import classnames from 'classnames';
import { Transforms } from "slate";
import { RenderElementProps, useSlate, useReadOnly, ReactEditor } from "slate-react";

import useTheme from "@/hooks/useTheme.ts";
import { CaretRightOutlined } from '@ant-design/icons';

import { DetailElement } from "../../types";
import AddParagraph from "../AddParagraph";

import styles from './index.module.less';

interface ICollapseElementProps {
  attributes: RenderElementProps['attributes'];
  element: DetailElement;
}

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = (props) => {
  const { attributes, children, element } = props;

  const [showContent, setShowContent] = useState(false);
  const [title, setTitle] = useState<string>(element.title || 'DETAIL');
  const titleRef = useRef<HTMLDivElement>(null);

  const { isDark } = useTheme();
  const editor = useSlate();
  const readOnly = useReadOnly();

  const onTitleBlur = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: titleRef.current?.innerText }, { at: path });
    setTitle(titleRef.current?.innerText || 'DETAIL');
  }

  const toggleShowContent = () => {
    setShowContent(!showContent);
  }

  const arrowClass = classnames(styles.arrow, {
    [styles.show]: showContent,
    [styles.hide]: !showContent
  });

  const contentClass = classnames(styles.content, {
    [styles.show]: showContent,
    [styles.hide]: !showContent
  });

  return (
    <div>
      <div className={classnames(styles.container, { [styles.dark]: isDark })}>
        <div className={styles.title} contentEditable={false} style={{ userSelect: 'none' }} >
          <div className={arrowClass} onClick={toggleShowContent}><CaretRightOutlined /></div>
          <div
            data-slate-editor
            ref={titleRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onBlur={onTitleBlur}
          >
            {title}
          </div>
        </div>
        <div className={contentClass}>
          <div {...attributes}>
            {children}
          </div>
        </div>
      </div>
      <AddParagraph element={element} />
    </div>
  );
}

export default Detail;