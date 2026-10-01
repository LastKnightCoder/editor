import { Box } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertCustomBlock } from "../insert";

const items: IBlockPanelListItem[] = [
  {
    icon: Box,
    title: "React 组件",
    keywords: ["React", "组件", "custom", "自定义", "react", "zidingyi"],
    description: "空白 React 组件",
    onClick: editor => {
      insertCustomBlock(editor);
    },
  },
];

export default items;
