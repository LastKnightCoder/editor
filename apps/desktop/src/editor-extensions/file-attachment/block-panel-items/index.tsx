import { Paperclip } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor";
import SelectFileModal from "../components/SelectFileModal";
import { insertFileAttachment } from "../utils.ts";
import { showMediaNode } from "@/editor-providers/mediaModalHost";

import { fileAttachmentTranslator } from "../i18n";

const items: IBlockPanelListItem[] = [
  {
    id: "host.file-attachment.insert",
    icon: Paperclip,
    get title() {
      return fileAttachmentTranslator.t("title");
    },
    keywords: ["文件", "附件", "file", "attachment"],
    get description() {
      return fileAttachmentTranslator.t("title");
    },
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
