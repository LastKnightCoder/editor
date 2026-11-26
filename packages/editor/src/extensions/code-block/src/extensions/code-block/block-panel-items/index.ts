import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Code2 } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertCodeBlock } from "../../../insert";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Code2,
      get title() {
        return editorT(editor, "block.code");
      },
      keywords: [...["codeblock", "代码块", "daimakuai"], ...editorAliases("block.code")],
      get description() {
        return editorT(editor, "block.code");
      },
      onClick: editor => {
        insertCodeBlock(editor);
      },
    },
  ];

  return items;
};
export default getItems;
