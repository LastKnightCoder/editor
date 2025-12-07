import { Layers } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertTabs } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Layers,
    title: "标签页",
    keywords: ["tabs", "Tabs", "标签页", "biaoqianye"],
    description: "标签页",
    onClick: (editor) => {
      insertTabs(editor);
    },
  },
];

export default items;
