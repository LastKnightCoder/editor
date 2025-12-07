import { Columns2 } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertMultiColumnsContainer } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Columns2,
    title: "多列布局",
    keywords: ["columns", "多列", "布局", "duolie"],
    description: "多列",
    onClick: (editor) => {
      insertMultiColumnsContainer(editor, 2);
    },
  },
];

export default items;
