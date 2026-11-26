import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Superscript } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";
import { insertAnnotation } from "../operations.ts";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Superscript,
      get title() {
        return editorT(editor, "block.annotation");
      },
      keywords: [
        ...["annotation", "注解", "zhujie", "note", "注释"],
        ...editorAliases("block.annotation"),
      ],
      get description() {
        return editorT(editor, "block.annotationDescription");
      },
      onClick: editor => {
        insertAnnotation(editor);
      },
    },
  ];

  return items;
};
export default getItems;
