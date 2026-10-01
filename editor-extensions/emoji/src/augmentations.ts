import type {} from "@tau/editor/api";
import type { EmojiElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    emoji: EmojiElement;
  }
  interface ExtensionInlineElementMap {
    emoji: EmojiElement;
  }
}
