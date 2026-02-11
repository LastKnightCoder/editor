import { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor/src";
import { getFileBaseName } from "@/commands";
import { v4 as getId } from "uuid";
import type { FileAttachmentElement } from "./types";

export const insertFileAttachment = async (
  editor: Editor,
  filePath: string,
  isLocal: boolean,
  fileName?: string,
) => {
  const resolvedFileName = fileName || (await getFileBaseName(filePath));
  const uuid = getId();

  const fileAttachmentNode: FileAttachmentElement = {
    type: "file-attachment",
    uuid,
    filePath,
    fileName: resolvedFileName,
    isLocal,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  };

  return setOrInsertNode(editor, fileAttachmentNode);
};
