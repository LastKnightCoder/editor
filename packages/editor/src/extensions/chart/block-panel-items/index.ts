import { BarChart2 } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertChart } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: BarChart2,
    title: "图表",
    keywords: ["chart", "图表", "柱状图", "折线图"],
    description: "数据图表",
    onClick: (editor) => {
      insertChart(editor);
    },
  },
];

export default items;
