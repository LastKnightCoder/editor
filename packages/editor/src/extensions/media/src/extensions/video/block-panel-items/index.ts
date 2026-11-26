import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import { Video } from "lucide-react";
import type { Editor } from "slate";
import { IBlockPanelListItem } from "@tau/editor/api";
import { getMediaInsertMenuItems } from "../../../utils/mediaInsert";

const getItems = (editor?: Editor): IBlockPanelListItem[] => {
  if (!editor) {
    return [];
  }
  return [
    {
      icon: Video,
      get title() {
        return editorT(editor, "block.video");
      },
      keywords: [...["视频", "video", "shipin"], ...editorAliases("block.video")],
      get description() {
        return editorT(editor, "block.insertVideo");
      },
      children: getMediaInsertMenuItems(editor, "video"),
    },
  ];
};

export default getItems;
