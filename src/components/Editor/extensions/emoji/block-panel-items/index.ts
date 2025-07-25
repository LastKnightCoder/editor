import { IBlockPanelListItem } from "@/components/Editor/types";
import { EmojiElement, FormattedText } from "@/components/Editor/types";
import { Transforms } from "slate";

const items: IBlockPanelListItem[] = [
  {
    icon: "emoji",
    title: "表情符号",
    keywords: ["emoji", "表情", "表情符号", "😊"],
    description: "插入表情符号",
    onClick: (editor) => {
      if (!editor.selection) return;

      const emoji: EmojiElement = {
        type: "emoji",
        emoji: "smile",
        nativeEmoji: "😊",
        shortcodes: ":smile:",
        defaultOpen: true,
        children: [{ type: "formatted", text: "" } as FormattedText],
      };

      Transforms.insertNodes(editor, emoji);
    },
  },
];

export default items;
