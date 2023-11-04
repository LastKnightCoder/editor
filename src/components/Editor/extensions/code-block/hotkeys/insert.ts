import { IHotKeyConfig } from "@/components/Editor/types";
import { insertCodeBlock, isCollapsed } from "@/components/Editor/utils";

export const insert: IHotKeyConfig[] = [{
  hotKey: 'mod+`',
  action: (editor) => {
    if (!isCollapsed(editor)) {
      return;
    }
    insertCodeBlock(editor, 'javascript');
  }
}]