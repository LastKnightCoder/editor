import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { getFileBaseName } from '@/commands';
import { v4 as getId } from 'uuid';

export const insertFileAttachment = async (editor: Editor, filePath: string) => {
  const fileName = await getFileBaseName(filePath);
  const uuid = getId();

  return setOrInsertNode(editor, {
    // @ts-ignore
    type: 'file-attachment',
    uuid,
    filePath,
    fileName,
    isLocal: true,
    children: [{
      type: 'formatted',
      text: ''
    }]
  });
}