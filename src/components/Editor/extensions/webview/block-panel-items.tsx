import { Editor } from "slate";
import { Modal } from "antd";
import { IBlockPanelListItem } from "@/components/Editor/types";

import InputUrlModal from "./InputUrlModal";
import { insertWebview } from "./utils";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: "",
    title: "网页",
    keywords: ["网页", "url", "webview", "wangye"],
    description: "插入一个网页视图",
    onClick: (editor: Editor) => {
      const modal = Modal.info({
        title: "输入网页地址",
        content: (
          <InputUrlModal
            onOk={(url: string) => {
              insertWebview(editor, url);
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
    },
  },
];

export default blockPanelItems;
