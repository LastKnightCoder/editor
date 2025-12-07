import { Table } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertTable } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Table,
    title: "表格",
    keywords: ["table", "表格", "biaoge"],
    description: "表格",
    onClick: (editor) => {
      insertTable(editor, 3, 3);
    },
  },
];

export default items;
