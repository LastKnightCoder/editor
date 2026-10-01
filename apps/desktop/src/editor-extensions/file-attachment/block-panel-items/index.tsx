import { Paperclip } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor";
import SelectFileModal from "../components/SelectFileModal";
import { insertFileAttachment } from "../utils.ts";
import { showMediaNode } from "@/editor-providers/mediaModalHost";

const items: IBlockPanelListItem[] = [
  {
    icon: Paperclip,
    title: "文件附件",
    keywords: ["文件", "附件", "file", "attachment"],
    description: "文件附件",
    onClick: async editor => {
      const close = showMediaNode(
        <SelectFileModal
          open
          onOk={(filePath: string, isLocal: boolean, fileName) => {
            insertFileAttachment(editor, filePath, isLocal, fileName);
            close();
          }}
          onCancel={() => close()}
        />
      );
    },
  },
];

export default items;
