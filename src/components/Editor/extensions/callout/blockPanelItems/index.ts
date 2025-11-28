import { MessageSquare } from "lucide-react";
import { insertCallout } from "@/components/Editor/utils";
import { IBlockPanelListItem } from "@/components/Editor/types";

const calloutChildren: IBlockPanelListItem[] = [
  {
    icon: MessageSquare,
    title: "提示",
    keywords: ["callout", "提示", "tip", "tishi"],
    description: "提示",
    onClick: (editor) => {
      insertCallout(editor, "tip");
    },
  },
  {
    icon: MessageSquare,
    title: "信息",
    keywords: ["callout", "信息", "info", "xinxi"],
    description: "信息",
    onClick: (editor) => {
      insertCallout(editor, "info");
    },
  },
  {
    icon: MessageSquare,
    title: "笔记",
    keywords: ["callout", "笔记", "note", "biji"],
    description: "笔记",
    onClick: (editor) => {
      insertCallout(editor, "note");
    },
  },
  {
    icon: MessageSquare,
    title: "危险",
    keywords: ["callout", "危险", "danger", "weixian"],
    description: "危险",
    onClick: (editor) => {
      insertCallout(editor, "danger");
    },
  },
  {
    icon: MessageSquare,
    title: "警告",
    keywords: ["callout", "警告", "warning", "jinggao"],
    description: "警告",
    onClick: (editor) => {
      insertCallout(editor, "warning");
    },
  },
];

const items: IBlockPanelListItem[] = [
  {
    icon: MessageSquare,
    title: "Callout",
    keywords: [
      "callout",
      "提示",
      "信息",
      "笔记",
      "危险",
      "警告",
      "tip",
      "info",
      "note",
      "danger",
      "warning",
    ],
    description: "插入 Callout",
    children: calloutChildren,
  },
];

export default items;
