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
      title: "音频",
      keywords: ["音频", "audio", "yinpin"],
      description: "插入音频",
      children: getMediaInsertMenuItems(editor, "audio"),
    },
  ];
};

export default getItems;
