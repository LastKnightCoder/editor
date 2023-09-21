import { Editor, Element as SlateElement, Range } from "slate";
import { HotKeyConfig } from "./types";
import { insertBlockMath, wrapInlineMath } from "../utils";

export const mathConfig: HotKeyConfig[] = [{
  hotKey: 'mod+shift+e',
  action: (editor, event) => {
    wrapInlineMath(editor);
    event.preventDefault();
  }
}, {
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


