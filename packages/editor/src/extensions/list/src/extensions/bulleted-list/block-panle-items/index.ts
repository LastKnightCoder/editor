import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { List } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertBulletList } from "../../../utils";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: List,
      get title() {
        return editorT(editor, "block.bulleted");
      },
      keywords: [...["bulleted-list", "列表", "liebiao", "ul"], ...editorAliases("block.bulleted")],
      get description() {
        return editorT(editor, "block.bulleted");
      },
      onClick: editor => {
        insertBulletList(editor);
      },
    },
  ];

  return items;
};
export default getItems;
