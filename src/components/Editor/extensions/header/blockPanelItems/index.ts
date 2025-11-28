import { Editor } from "slate";
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
} from "lucide-react";
import { insertHeader } from "@/components/Editor/utils";
import { IBlockPanelListItem } from "@/components/Editor/types";

const iconComponents = [
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
];

const headerChildren = ([1, 2, 3, 4, 5, 6] as const).map((level) => {
  return {
    icon: iconComponents[level - 1],
    title: "标题" + level,
    keywords: ["h" + level, "标题" + level, "biaoti"],
    description: "标题" + level,
    onClick: (editor: Editor) => {
      insertHeader(editor, level);
    },
  };
});

const headers: IBlockPanelListItem[] = [
  {
    icon: Heading1,
    title: "标题",
    keywords: [
      "heading",
      "title",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "标题",
      "biaoti",
    ],
    description: "插入标题",
    children: headerChildren,
  },
];

export default headers;
