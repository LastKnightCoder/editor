import { Image } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertPlantUML } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Image,
    title: "PlantUML",
    keywords: ["plantuml", "uml", "图表"],
    description: "PlantUML 图表",
    onClick: (editor) => {
      insertPlantUML(editor);
    },
  },
];

export default items;
