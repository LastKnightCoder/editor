import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Quote } from "lucide-react";

import { IBlockPanelListItem } from "../types";
import { insertBlockquote } from "../operations";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Quote,
      get title() {
        return editorT(editor, "block.quote");
      },
      keywords: [
        ...["blockquote", "引用块", "yinyongkuai", "quote"],
        ...editorAliases("block.quote"),
      ],
      get description() {
        return editorT(editor, "block.quote");
      },
      onClick: editor => {
        insertBlockquote(editor);
      },
    },
  ];

  return items;
};
export default getItems;
