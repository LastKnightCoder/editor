import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Image } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertPlantUML } from "../../../insert";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Image,
      get title() {
        return editorT(editor, "block.plantuml");
      },
      keywords: [...["plantuml", "uml", "图表"], ...editorAliases("block.plantuml")],
      get description() {
        return editorT(editor, "block.plantumlDescription");
      },
      onClick: editor => {
        insertPlantUML(editor);
      },
    },
  ];

  return items;
};
export default getItems;
