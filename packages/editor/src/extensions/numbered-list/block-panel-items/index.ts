import { ListOrdered } from "lucide-react";
import { insertNumberedList } from "../../../utils";
import { IBlockPanelListItem } from "../../../types";

const items: IBlockPanelListItem[] = [
  {
    icon: ListOrdered,
    title: "有序列表",
    keywords: ["numbered-list", "列表", "liebiao", "ol"],
    description: "有序列表",
    onClick: (editor) => {
      insertNumberedList(editor);
    },
  },
];

export default items;
