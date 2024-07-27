import { RenderElementProps } from "slate-react";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";

import FileAttachment from './components/FileAttachment';
import { overwrite } from './plugins';
import blockPanelItems from "./block-panel-items";

export interface FileAttachmentElement {
  type: 'file-attachment';
  fileName: string;
  filePath: string;
  isLocal: boolean;
  uuid: string;
}

class FileAttachmentExtension extends Base implements IExtension {
  type = 'file-attachment';

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [overwrite];
  }

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