import { Presentation } from "lucide-react";
import { Editor } from "slate";
import { IBlockPanelListItem } from "@tau/editor";
import { insertWhiteboard, insertExistingWhiteboard } from "./utils";
import { createRoot } from "react-dom/client";
import SelectWhiteboardContentModal from "./components/SelectWhiteboardContentModal";
import { WhiteboardContent, Whiteboard } from "@/types";

import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { whiteboardEmbedTranslator } from "./i18n";
import { reactRootErrorHandlers } from "@/utils/console-logger";

const showSelectWhiteboardModal = (editor: Editor) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container, reactRootErrorHandlers);

  const handleOk = async (whiteboardContent: WhiteboardContent, _whiteboard: Whiteboard) => {
    await insertExistingWhiteboard(editor, whiteboardContent);
    root.unmount();
    container.remove();
  };

  const handleCancel = () => {
    root.unmount();
    container.remove();
  };

  root.render(
    <I18nRuntimeProvider runtime={desktopI18n}>
      <SelectWhiteboardContentModal open={true} onOk={handleOk} onCancel={handleCancel} />
    </I18nRuntimeProvider>
  );
};

const blockPanelItems: IBlockPanelListItem[] = [
  {
    id: "host.whiteboard.insert",
    get title() {
      return whiteboardEmbedTranslator.t("insert.title");
    },
    icon: Presentation,
    keywords: ["whiteboard", "canvas", "draw", "白板", "画布", "绘图"],
    get description() {
      return whiteboardEmbedTranslator.t("insert.description");
    },
    onClick: (editor: Editor) => {
      insertWhiteboard(editor);
    },
  },
  {
    id: "host.whiteboard.reference",
    get title() {
      return whiteboardEmbedTranslator.t("reference.title");
    },
    icon: Presentation,
    keywords: ["reference", "existing", "whiteboard", "引用", "已有", "白板"],
    get description() {
      return whiteboardEmbedTranslator.t("reference.description");
    },
    onClick: (editor: Editor) => {
      showSelectWhiteboardModal(editor);
    },
  },
];

export default blockPanelItems;
