import { Paperclip } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/src";
import SelectFileModal from "../components/SelectFileModal";
import { insertFileAttachment } from "../utils.ts";
import showCustomModal from "@/components/CustomModal/showCustomModal";

const items: IBlockPanelListItem[] = [
  {
    icon: Paperclip,
    title: "文件附件",
    keywords: ["文件", "附件", "file", "attachment"],
    description: "文件附件",
    onClick: async (editor) => {
      const modal = showCustomModal({
        title: "选择文件附件",
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
        closeOnOverlay: true,
      });
    },
  },
];

export default items;
