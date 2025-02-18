import { IBlockPanelListItem } from "@/components/Editor/types";
import SelectFileModal from '../components/SelectFileModal';
// import { selectFile } from '@/commands'
import { insertFileAttachment } from '../utils.ts';
import { Modal } from "antd";

const items: IBlockPanelListItem[] = [{
  icon: 'file-attachment',
  title: '文件附件',
  keywords: ['文件', '附件', 'file', 'attachment'],
  description: '文件附件',
  onClick: async (editor) => {
    const modal = Modal.info({
      title: '选择文件附件',
      content: (
        <SelectFileModal
          onOk={(filePath: string, isLocal: boolean, fileName) => {
            insertFileAttachment(editor, filePath, isLocal, fileName);
            modal.destroy();
          }}
          onCancel={() => {
            modal.destroy();
          }}
        />
      ),
      footer: null,
      maskClosable: true,
    });
    // const filePath = await selectFile().catch((err) => {
    //   console.error(err);
    //   return '';
    // });
    // if (!filePath || Array.isArray(filePath)) return;
    // return insertFileAttachment(editor, filePath);
  }
}]

export default items;
