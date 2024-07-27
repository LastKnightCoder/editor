import { IBlockPanelListItem } from "@/components/Editor/types";
import { open } from "@tauri-apps/api/dialog"
import { insertFileAttachment } from '../utils.ts';

const items: IBlockPanelListItem[] = [{
  icon: 'file-attachment',
  title: '文件附件',
  keywords: ['文件', '附件', 'file', 'attachment'],
  description: '文件附件',
  onClick: async (editor) => {
    const filePath = await open();
    if (!filePath || Array.isArray(filePath)) return;
    return insertFileAttachment(editor, filePath);
  }
}]

export default items;