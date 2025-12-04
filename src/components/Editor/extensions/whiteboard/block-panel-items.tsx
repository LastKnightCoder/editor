import { Presentation } from "lucide-react";
import { Editor } from "slate";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertWhiteboard, insertExistingWhiteboard } from "./utils";
import { createRoot } from "react-dom/client";
import SelectWhiteBoardContentModal from "./components/SelectWhiteBoardContentModal";
import { WhiteBoardContent, WhiteBoard } from "@/types";

const showSelectWhiteBoardModal = (editor: Editor) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const handleOk = async (
    whiteBoardContent: WhiteBoardContent,
    _whiteBoard: WhiteBoard,
  ) => {
    await insertExistingWhiteboard(editor, whiteBoardContent);
    root.unmount();
    container.remove();
  };

  const handleCancel = () => {
    root.unmount();
    container.remove();
  };

  root.render(
    <SelectWhiteBoardContentModal
      open={true}
      onOk={handleOk}
      onCancel={handleCancel}
    />,
  );
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
      showSelectWhiteBoardModal(editor);
    },
  },
];

export default blockPanelItems;
