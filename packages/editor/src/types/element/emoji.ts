import { Descendant } from "slate";

export interface EmojiElement {
  type: "emoji";
  emoji: string;
  nativeEmoji?: string;
  defaultOpen?: boolean;
  shortcodes?: string;
  children: Descendant[];
}
