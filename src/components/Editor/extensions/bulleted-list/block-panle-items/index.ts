import { List } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertBulletList } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: List,
    title: "无序列表",
    keywords: ["bulleted-list", "列表", "liebiao", "ul"],
    description: "无序列表",
    onClick: (editor) => {
      insertBulletList(editor);
    },
  },
];

export default items;
