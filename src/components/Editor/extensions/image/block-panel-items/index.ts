import { Image } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertImage } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Image,
    title: "图片",
    keywords: ["image", "图片", "tupian"],
    description: "图片",
    onClick: (editor) => {
      insertImage(editor, {
        url: "",
      });
    },
  },
];

export default items;
