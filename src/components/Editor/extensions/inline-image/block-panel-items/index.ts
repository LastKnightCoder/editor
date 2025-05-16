import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertInlineImage } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "image",
    title: "行内图片",
    keywords: ["inline-image", "行内图片", "行内图片"],
    description: "行内图片",
    onClick: (editor) => {
      insertInlineImage(editor, {
        url: "",
      });
    },
  },
];

export default items;
