import { RenderElementProps } from "slate-react";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";

import FileAttachment from './components/FileAttachment';

export interface FileAttachmentElement {
  type: 'file-attachment';
  fileId: number;
}

class FileAttachmentExtension extends Base implements IExtension {
  type = 'file-attachment';

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <FileAttachment
        element={element as unknown as FileAttachmentElement}
        attributes={attributes}
      >
        {children}
      </FileAttachment>
    )
  }
}

export default FileAttachmentExtension;