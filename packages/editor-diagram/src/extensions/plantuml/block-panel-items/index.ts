import { Image } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertPlantUML } from "../../../insert";

const items: IBlockPanelListItem[] = [
  {
    icon: Image,
    title: "PlantUML",
    keywords: ["plantuml", "uml", "图表"],
    description: "PlantUML 图表",
    onClick: editor => {
      insertPlantUML(editor);
    },
  },
];

export default items;
