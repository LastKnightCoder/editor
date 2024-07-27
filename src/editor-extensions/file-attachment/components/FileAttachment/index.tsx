import React from "react";
import { RenderElementProps } from "slate-react";
import { FileAttachmentElement } from "@/editor-extensions/file-attachment";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import { MdDragIndicator } from "react-icons/md";
import { showInFolder } from '@/commands';

import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import styles from './index.module.less';
import classnames from "classnames";

interface IFileAttachmentProps {
  element: FileAttachmentElement;
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
}

const FileAttachment = (props: IFileAttachmentProps) => {
  const { element, attributes, children } = props;

  const { fileName, filePath } = element;

  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    // @ts-ignore
    element,
  });

  const handleClickCard = () => {
    showInFolder(filePath);
  }

  return (
    <div
      ref={drop}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
      contentEditable={false}
    >
      <div className={styles.fileAttachmentContainer} onClick={handleClickCard}>
        <div className={styles.fileName}>{fileName}</div>
        <div className={styles.filePath}>{filePath}</div>
      </div>
      <div {...attributes}>
        {children}
      </div>
      <AddParagraph element={element as any}/>
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default FileAttachment;