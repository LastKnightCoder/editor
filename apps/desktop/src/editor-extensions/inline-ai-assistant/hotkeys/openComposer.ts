import type { IHotKeyConfig } from "@tau/editor/src";
import { toggleInlineAIComposer } from "../panel-manager";

export const openInlineAIComposerHotkey: IHotKeyConfig[] = [
  {
    hotKey: "mod+j",
    action: (editor, event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleInlineAIComposer(editor, "hotkey");
    },
  },
];
