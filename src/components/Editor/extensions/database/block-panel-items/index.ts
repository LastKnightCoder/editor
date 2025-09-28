import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertDatabase } from "../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "table",
    title: "数据库视图",
    description: "插入一个数据表视图",
    keywords: ["database", "数据表", "table"],
    onClick: (editor) => {
      insertDatabase(editor);
    },
  },
];

export default items;
