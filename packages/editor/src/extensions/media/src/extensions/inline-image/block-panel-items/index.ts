import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Image } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";
import { insertInlineImage } from "../../../utils/insertElement";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      group: "tau.image",
      icon: Image,
      get title() {
        return editorT(editor, "block.inlineImage");
      },
      keywords: [
        ...["行内图片", "image", "tupian", "inline-image"],
        ...editorAliases("block.inlineImage"),
      ],
      get description() {
        return editorT(editor, "block.inlineImage");
      },
      onClick: editor => {
        insertInlineImage(editor, {
          url: "",
        });
      },
    },
  ];

  return items;
};
export default getItems;
