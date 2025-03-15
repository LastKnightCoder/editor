import { Editor } from "slate";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertWhiteboard } from "./utils";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    title: "白板",
    icon: "whiteboard",
    keywords: ["whiteboard", "canvas", "draw", "白板", "画布", "绘图"],
    description: "插入一个可绘图的白板",
    onClick: (editor: Editor) => {
      insertWhiteboard(editor);
    },
  },
];

export default blockPanelItems;
