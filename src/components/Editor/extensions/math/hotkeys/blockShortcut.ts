import { HotKeyConfig } from "@/components/Editor/hotkeys/types.ts";
import { insertBlockMath } from "@/components/Editor/utils";
import {Editor, Element as SlateElement, Range} from "slate";

export const blockShortcut:  HotKeyConfig[] = [{
  hotKey: 'mod+shift+m',
  action: (editor, event) => {
    // 是否在段落开头，且段落为空
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'paragraph',
      });
      if (!match) {
        return;
      }
      insertBlockMath(editor);
      event.preventDefault();
    }
  }
}]