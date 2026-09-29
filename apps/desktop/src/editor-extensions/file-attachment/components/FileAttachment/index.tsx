import React from "react";
import { RenderElementProps } from "slate-react";
import { FileAttachmentElement } from "@/editor-extensions/file-attachment/types";
import {
  AddParagraph,
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
  useDragAndDrop,
  useNotifier,
  type EditorLoadingHandle,
} from "@tau/editor/src";
import { cn } from "@tau/ui";
import { showInFolder } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

interface IFileAttachmentProps {
  element: FileAttachmentElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const FileAttachment = (props: IFileAttachmentProps) => {
  const { element, attributes, children } = props;

  const { fileName, filePath, isLocal, localFilePath = filePath } = element;
  const notifier = useNotifier();

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });
  const dropActive = isOverCurrent && canDrop;

  const handleClickCard = async () => {
    if (isLocal) {
      try {
        await showInFolder(localFilePath);
      } catch (e) {
        notifier.error("文件不存在");
        console.error(e);
      }
      return;
    }
    let progress: EditorLoadingHandle | undefined;
    try {
      progress = notifier.loading("正在下载文件");
      const localPath = await remoteResourceToLocal(filePath);
      await showInFolder(localPath);
      progress.success("已在文件夹中显示");
    } catch (e) {
      if (progress) progress.error("下载失败");
      else notifier.error("下载失败");
      console.error(e);
    }
  };

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={cn("relative", BLOCK_DRAG_GROUP, dimWhileDragging(isDragging || dropActive))}
      contentEditable={false}
    >
      <DropIndicator active={dropActive} before={isBefore} />
      <div {...attributes}>
        <div
          className="border-line-1 bg-surface hover:bg-hover flex cursor-pointer flex-col gap-[0.5em] border px-[1em] py-[0.75em]"
          onClick={handleClickCard}
        >
          <div className="text-ink-1 text-[1em] font-medium">{fileName}</div>
          <div className="text-ink-3 overflow-hidden text-ellipsis whitespace-nowrap text-[0.75em]">
            {filePath}
          </div>
        </div>
        {children}
        <AddParagraph element={element} />
        <DragHandle
          dragRef={node => {
            drag(node);
          }}
          canDrag={canDrag}
        />
      </div>
    </div>
  );
};

export default FileAttachment;
