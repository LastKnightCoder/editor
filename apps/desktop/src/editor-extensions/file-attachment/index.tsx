import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";

import FileAttachment from "./components/FileAttachment";
import blockPanelItems from "./block-panel-items";
import { fileAttachmentIngestSpec } from "./ingest";
import { FileAttachmentElement } from "./types";
export type { FileAttachmentElement } from "./types";

const fileAttachmentExtension = defineExtension({
  id: "host.file-attachment",
  elements: [
    defineElement<FileAttachmentElement>({
      type: "file-attachment",
      dataVersion: 1,
      resources: BUILTIN_CONTENT_RESOURCES["file-attachment"],
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<FileAttachmentElement>) => (
        <FileAttachment element={element} attributes={attributes}>
          {children}
        </FileAttachment>
      ),
      drag: true,
      // 任意文件拖入的兜底认领（accept:*，装配顺序在内置 image/audio/video 之后）
      ingest: fileAttachmentIngestSpec,
    }),
  ],
  blockPanel: blockPanelItems,
});

export default fileAttachmentExtension;
