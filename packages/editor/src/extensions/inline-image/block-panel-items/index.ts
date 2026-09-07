import { Image } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertInlineImage } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Image,
    title: "行内图片",
    keywords: ["行内图片", "image", "tupian", "inline-image"],
    description: "行内图片",
    onClick: editor => {
      insertInlineImage(editor, {
        url: "",
      });
    },
  },
];

export default items;
