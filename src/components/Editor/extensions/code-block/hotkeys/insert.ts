import {HotKeyConfig} from "@/components/Editor/hotkeys/types.ts";
import {insertCodeBlock, isCollapsed} from "@/components/Editor/utils";

export const insert: HotKeyConfig[] = [{
  hotKey: 'mod+`',
  action: (editor) => {
    if (!isCollapsed(editor)) {
      return;
    }
    insertCodeBlock(editor, 'javascript');
  }
}]