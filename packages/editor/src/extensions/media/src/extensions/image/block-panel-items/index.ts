import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import { Image } from "lucide-react";
import type { Editor } from "slate";
import { IBlockPanelListItem } from "@tau/editor/api";
import { getMediaInsertMenuItems } from "../../../utils/mediaInsert";

const getItems = (editor?: Editor): IBlockPanelListItem[] => {
  if (!editor) {
    return [];
  }
  return [
    {
      id: "tau.image",
      icon: Image,
      get title() {
        return editorT(editor, "block.image");
      },
      keywords: [...["图片", "image", "tupian"], ...editorAliases("block.image")],
      get description() {
        return editorT(editor, "block.insertImage");
      },
      children: getMediaInsertMenuItems(editor, "image"),
    },
  ];
};

export default getItems;
