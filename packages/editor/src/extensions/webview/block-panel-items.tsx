import { Editor } from "slate";
import { Globe } from "lucide-react";
import { IBlockPanelListItem } from "../../types";
import { showCustomModal } from "@tau/shared";

import InputUrlModal from "./InputUrlModal";
import { insertWebview } from "./utils";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: Globe,
    title: "网页",
    keywords: ["网页", "url", "webview", "wangye"],
    description: "插入一个网页视图",
    onClick: (editor: Editor) => {
      const modal = showCustomModal({
        title: null,
        content: (
          <InputUrlModal
            editor={editor}
            onOk={({ url, sourceType }) => {
              insertWebview(editor, { url, sourceType });
              modal.destroy();
            }}
            onCancel={() => {
              modal.destroy();
            }}
          />
        ),
        footer: null,
        closeOnOverlay: true,
        width: 460,
        centered: true,
        showCloseButton: false,
      });
    },
  },
];

export default blockPanelItems;
