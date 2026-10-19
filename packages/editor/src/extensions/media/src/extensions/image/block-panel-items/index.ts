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
      icon: Image,
      title: "图片",
      keywords: ["图片", "image", "tupian"],
      description: "插入图片",
      children: getMediaInsertMenuItems(editor, "image"),
    },
  ];
};

export default getItems;
