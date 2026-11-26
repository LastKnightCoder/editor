import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import { AudioLines } from "lucide-react";
import type { Editor } from "slate";
import { IBlockPanelListItem } from "@tau/editor/api";
import { getMediaInsertMenuItems } from "../../../utils/mediaInsert";

const getItems = (editor?: Editor): IBlockPanelListItem[] => {
  if (!editor) {
    return [];
  }
  return [
    {
      icon: AudioLines,
      get title() {
        return editorT(editor, "block.audio");
      },
      keywords: [...["音频", "audio", "yinpin"], ...editorAliases("block.audio")],
      get description() {
        return editorT(editor, "block.insertAudio");
      },
      children: getMediaInsertMenuItems(editor, "audio"),
    },
  ];
};

export default getItems;
