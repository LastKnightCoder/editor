import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { MessageSquare } from "lucide-react";
import { insertCallout } from "../operations";
import { IBlockPanelListItem } from "../types";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const calloutChildren: IBlockPanelListItem[] = [
    {
      icon: MessageSquare,
      get title() {
        return editorT(editor, "callout.tip");
      },
      keywords: [...["callout", "提示", "tip", "tishi"], ...editorAliases("callout.tip")],
      get description() {
        return editorT(editor, "callout.tip");
      },
      onClick: editor => {
        insertCallout(editor, "tip");
      },
    },
    {
      icon: MessageSquare,
      get title() {
        return editorT(editor, "callout.info");
      },
      keywords: [...["callout", "信息", "info", "xinxi"], ...editorAliases("callout.info")],
      get description() {
        return editorT(editor, "callout.info");
      },
      onClick: editor => {
        insertCallout(editor, "info");
      },
    },
    {
      icon: MessageSquare,
      get title() {
        return editorT(editor, "callout.note");
      },
      keywords: [...["callout", "笔记", "note", "biji"], ...editorAliases("callout.note")],
      get description() {
        return editorT(editor, "callout.note");
      },
      onClick: editor => {
        insertCallout(editor, "note");
      },
    },
    {
      icon: MessageSquare,
      get title() {
        return editorT(editor, "callout.danger");
      },
      keywords: [...["callout", "危险", "danger", "weixian"], ...editorAliases("callout.danger")],
      get description() {
        return editorT(editor, "callout.danger");
      },
      onClick: editor => {
        insertCallout(editor, "danger");
      },
    },
    {
      icon: MessageSquare,
      get title() {
        return editorT(editor, "callout.warning");
      },
      keywords: [...["callout", "警告", "warning", "jinggao"], ...editorAliases("callout.warning")],
      get description() {
        return editorT(editor, "callout.warning");
      },
      onClick: editor => {
        insertCallout(editor, "warning");
      },
    },
  ];

  const items: IBlockPanelListItem[] = [
    {
      icon: MessageSquare,
      get title() {
        return editorT(editor, "block.callout");
      },
      keywords: [
        ...[
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
        ...editorAliases("block.callout"),
      ],
      get description() {
        return editorT(editor, "block.insertCallout");
      },
      children: calloutChildren,
    },
  ];

  return items;
};
export default getItems;
