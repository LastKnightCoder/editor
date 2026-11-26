import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Smile } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import type { EmojiElement } from "../types";
import { Transforms } from "slate";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Smile,
      get title() {
        return editorT(editor, "block.emoji");
      },
      keywords: [...["emoji", "表情", "表情符号", "😊"], ...editorAliases("block.emoji")],
      get description() {
        return editorT(editor, "block.insertEmoji");
      },
      onClick: editor => {
        if (!editor.selection) return;

        const emoji: EmojiElement = {
          type: "emoji",
          emoji: "smile",
          nativeEmoji: "😊",
          shortcodes: ":smile:",
          defaultOpen: true,
          children: [{ type: "formatted", text: "" }],
        };

        Transforms.insertNodes(editor, emoji);
      },
    },
  ];

  return items;
};
export default getItems;
