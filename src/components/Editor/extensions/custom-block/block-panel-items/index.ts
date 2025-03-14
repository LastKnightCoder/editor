import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertCustomBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "custom",
    title: "自定义",
    keywords: ["custom", "自定义", "react", "zidingyi"],
    description: "自定义",
    onClick: (editor) => {
      insertCustomBlock(editor);
    },
  },
];

export default items;
