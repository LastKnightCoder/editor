import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertPlantUML } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "image",
    title: "PlantUML",
    keywords: ["plantuml", "uml", "图表"],
    description: "PlantUML 图表",
    onClick: (editor) => {
      insertPlantUML(editor);
    },
  },
];

export default items;
