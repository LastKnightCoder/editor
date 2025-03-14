import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertTabs } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "tabs",
    title: "标签页",
    keywords: ["tabs", "Tabs", "标签页", "biaoqianye"],
    description: "标签页",
    onClick: (editor) => {
      insertTabs(editor);
    },
  },
];

export default items;
