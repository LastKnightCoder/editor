import { Image } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertImage } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Image,
    title: "块级图片",
    keywords: ["image", "图片", "块级图片", "tupian"],
    description: "插入一个独立图片块",
    onClick: (editor) => {
      insertImage(editor, {
        url: "",
      });
    },
  },
];

export default items;
