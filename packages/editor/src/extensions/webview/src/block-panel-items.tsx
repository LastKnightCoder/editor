import { I18nRuntimeProvider } from "@tau/i18n/react";
import { editorRuntime } from "../../../i18n-runtime";
import { editorT, editorAliases } from "../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Editor } from "slate";
import { createRoot } from "react-dom/client";
import { Globe } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";

import InputUrlModal from "./InputUrlModal";
import { insertWebview } from "./utils";

/** 块面板入口无宿主组件可挂，独立 root 渲染；关闭先播退场动画，结束后卸载 */
const openInsertWebviewModal = (editor: Editor) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = (open: boolean) =>
    root.render(
      <I18nRuntimeProvider runtime={editorRuntime(editor)}>
        <InputUrlModal
          editor={editor}
          open={open}
          onOk={({ url, sourceType }) => {
            insertWebview(editor, { url, sourceType });
            render(false);
          }}
          onCancel={() => render(false)}
          onAfterClose={() => {
            queueMicrotask(() => {
              root.unmount();
              container.remove();
            });
          }}
        />
      </I18nRuntimeProvider>
    );

  render(true);
};

// 打开菜单时读取图标，避免生产分块的循环依赖提前固化未初始化的导入。
const blockPanelItems = (editor: LocaleEditor): IBlockPanelListItem[] => [
  {
    icon: Globe,
    get title() {
      return editorT(editor, "block.webview");
    },
    keywords: [...["网页", "url", "webview", "wangye"], ...editorAliases("block.webview")],
    get description() {
      return editorT(editor, "block.webviewDescription");
    },
    onClick: openInsertWebviewModal,
  },
];

export default blockPanelItems;
