import { Video } from "lucide-react";
import type { Editor } from "slate";
import { IBlockPanelListItem } from "../../../types";
import { getMediaInsertMenuItems } from "../../../utils/mediaInsert";

const getItems = (editor?: Editor): IBlockPanelListItem[] => {
  if (!editor) {
    return [];
  }
  return [
    {
      icon: Video,
      title: "视频",
      keywords: ["视频", "video", "shipin"],
      description: "插入视频",
      children: getMediaInsertMenuItems(editor, "video"),
    },
  ];
};

export default getItems;
