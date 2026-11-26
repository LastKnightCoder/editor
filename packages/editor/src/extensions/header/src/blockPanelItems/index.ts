import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Editor } from "slate";
import { Heading1, Heading2, Heading3, Heading4, Heading5, Heading6 } from "lucide-react";
import { insertHeader } from "../operations";
import type { IBlockPanelListItem } from "@tau/editor/api";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const iconComponents = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];

  const headerChildren = ([1, 2, 3, 4, 5, 6] as const).map(level => {
    return {
      icon: iconComponents[level - 1],
      get title() {
        return editorT(editor, `block.heading${level}`);
      },
      keywords: [
        ...["h" + level, "标题" + level, "biaoti"],
        ...editorAliases(`block.heading${level}`),
      ],
      get description() {
        return editorT(editor, `block.heading${level}`);
      },
      onClick: (editor: Editor) => {
        insertHeader(editor, level);
      },
    };
  });

  const headers: IBlockPanelListItem[] = [
    {
      icon: Heading1,
      get title() {
        return editorT(editor, "block.heading");
      },
      keywords: [
        ...["heading", "title", "h1", "h2", "h3", "h4", "h5", "h6", "标题", "biaoti"],
        ...editorAliases("block.heading"),
      ],
      get description() {
        return editorT(editor, "block.insertHeading");
      },
      children: headerChildren,
    },
  ];

  return headers;
};
export default getItems;
