import React from "react";
import { RenderElementProps } from "slate-react";
import { FileAttachmentElement } from "@/editor-extensions/file-attachment/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import { MdDragIndicator } from "react-icons/md";
import { showInFolder } from "@/commands";

import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import styles from "./index.module.less";
import classnames from "classnames";
import { remoteResourceToLocal } from "@/utils";
import { App } from "antd";

interface IFileAttachmentProps {
  element: FileAttachmentElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const FileAttachment = (props: IFileAttachmentProps) => {
  const { element, attributes, children } = props;

  const { fileName, filePath, isLocal, localFilePath = filePath } = element;
  const { message } = App.useApp();

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      // @ts-ignore
      element,
    });

  const handleClickCard = async () => {
    if (isLocal) {
      try {
        await showInFolder(localFilePath);
      } catch (e) {
        message.error("文件不存在");
        console.error(e);
      }
    } else {
      try {
        message.loading({
          key: "file-attachment-downloading",
          content: "正在下载文件",
          duration: 0,
        });
        const localPath = await remoteResourceToLocal(filePath);
        await showInFolder(localPath);
      } catch (e) {
        message.error({
          key: "file-attachment-downloading",
          content: "下载失败",
        });
      } finally {
        message.destroy("file-attachment-downloading");
      }
    }
  };

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
      <div {...attributes}>
        <div
          className={styles.fileAttachmentContainer}
          onClick={handleClickCard}
        >
          <div className={styles.fileName}>{fileName}</div>
          <div className={styles.filePath}>{filePath}</div>
        </div>
        {children}
        <AddParagraph element={element as any} />
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
      </div>
    </div>
  );
};

export default FileAttachment;
