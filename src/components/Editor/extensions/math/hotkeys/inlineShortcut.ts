import { HotKeyConfig } from "@/components/Editor/hotkeys/types.ts";
import { wrapInlineMath } from "@/components/Editor/utils";

export const inlineShortcut: HotKeyConfig[] = [{
  hotKey: 'mod+shift+e',
  action: (editor, event) => {
    wrapInlineMath(editor);
    event.preventDefault();
  }
}]