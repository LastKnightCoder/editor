import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertCustomBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "custom",
    title: "React 组件",
    keywords: ["React", "组件", "custom", "自定义", "react", "zidingyi"],
    description: "React 组件",
    onClick: (editor) => {
      insertCustomBlock(editor);
    },
  },
];

export default items;
