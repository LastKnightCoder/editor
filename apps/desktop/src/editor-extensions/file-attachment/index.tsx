import { RenderElementProps } from "slate-react";
import { Base } from "@tau/editor/src";
import { IExtension } from "@tau/editor/src";

import FileAttachment from "./components/FileAttachment";
import { overwrite } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { fileAttachmentIngestSpec } from "./ingest";
import { FileAttachmentElement } from "./types";
export type { FileAttachmentElement } from "./types";

class FileAttachmentExtension extends Base implements IExtension {
  type = "file-attachment";

  override dragSpec = true;
  override ingestSpec = fileAttachmentIngestSpec;

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [overwrite];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <FileAttachment element={element as unknown as FileAttachmentElement} attributes={attributes}>
        {children}
      </FileAttachment>
    );
  }
}

export default FileAttachmentExtension;
