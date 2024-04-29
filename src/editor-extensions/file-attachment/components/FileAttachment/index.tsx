import React from "react";
import { RenderElementProps } from "slate-react";
import { FileAttachmentElement } from "@/editor-extensions/file-attachment";

interface IFileAttachmentProps {
  element: FileAttachmentElement;
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
}

const FileAttachment = (props: IFileAttachmentProps) => {
  const { element, attributes, children } = props;

  const { fileId } = element;

  console.log(fileId);

  return (
    <div {...attributes}>
      {children}
    </div>
  )
}

export default FileAttachment;