import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Sigma } from "lucide-react";
import { insertBlockMath } from "../insert";
import type { IBlockPanelListItem } from "@tau/editor/api";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Sigma,
      get title() {
        return editorT(editor, "block.math");
      },
      keywords: [
        ...["math", "数学公式", "latex", "katex", "shuxue"],
        ...editorAliases("block.math"),
      ],
      get description() {
        return editorT(editor, "block.math");
      },
      onClick: editor => {
        insertBlockMath(editor);
      },
    },
  ];

  return items;
};
export default getItems;
