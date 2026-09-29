import { Editor } from "slate";
import { createRoot } from "react-dom/client";
import { Globe } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor";

import InputUrlModal from "./InputUrlModal";
import { insertWebview } from "./utils";

/** 块面板入口无宿主组件可挂，独立 root 渲染；关闭先播退场动画，结束后卸载 */
const openInsertWebviewModal = (editor: Editor) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = (open: boolean) =>
    root.render(
      <InputUrlModal
        editor={editor}
        open={open}
        onOk={({ url, sourceType }) => {
          insertWebview(editor, { url, sourceType });
          render(false);
        }}
        onCancel={() => render(false)}
        onAfterClose={() => {
          root.unmount();
          container.remove();
        }}
      />
    );

  render(true);
};

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: Globe,
    title: "网页",
    keywords: ["网页", "url", "webview", "wangye"],
    description: "插入一个网页视图",
    onClick: openInsertWebviewModal,
  },
];

export default blockPanelItems;
