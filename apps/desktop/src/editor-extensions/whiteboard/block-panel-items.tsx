import { Presentation } from "lucide-react";
import { Editor } from "slate";
import { IBlockPanelListItem } from "@tau/editor";
import { insertWhiteboard, insertExistingWhiteboard } from "./utils";
import { createRoot } from "react-dom/client";
import SelectWhiteboardContentModal from "./components/SelectWhiteboardContentModal";
import { WhiteboardContent, Whiteboard } from "@/types";

const showSelectWhiteboardModal = (editor: Editor) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const handleOk = async (whiteboardContent: WhiteboardContent, _whiteboard: Whiteboard) => {
    await insertExistingWhiteboard(editor, whiteboardContent);
    root.unmount();
    container.remove();
  };

  const handleCancel = () => {
    root.unmount();
    container.remove();
  };

  root.render(<SelectWhiteboardContentModal open={true} onOk={handleOk} onCancel={handleCancel} />);
};

const blockPanelItems: IBlockPanelListItem[] = [
  {
    title: "白板",
    icon: Presentation,
    keywords: ["whiteboard", "canvas", "draw", "白板", "画布", "绘图"],
    description: "插入一个新的白板",
    onClick: (editor: Editor) => {
      insertWhiteboard(editor);
    },
  },
  {
    title: "引用白板",
    icon: Presentation,
    keywords: ["reference", "existing", "whiteboard", "引用", "已有", "白板"],
    description: "引用一个已有的白板",
    onClick: (editor: Editor) => {
      showSelectWhiteboardModal(editor);
    },
  },
];

export default blockPanelItems;
