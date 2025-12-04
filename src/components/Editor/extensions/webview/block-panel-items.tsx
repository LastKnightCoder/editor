import { Editor } from "slate";
import { Globe } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";

import InputUrlModal from "./InputUrlModal";
import { insertWebview } from "./utils";
import showCustomModal from "@/components/CustomModal/showCustomModal";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: Globe,
    title: "网页",
    keywords: ["网页", "url", "webview", "wangye"],
    description: "插入一个网页视图",
    onClick: (editor: Editor) => {
      const modal = showCustomModal({
        title: "输入网页地址",
        content: (
          <InputUrlModal
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
      });
    },
  },
];

export default blockPanelItems;
