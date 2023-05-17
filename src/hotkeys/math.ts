import {Editor, Range, Transforms} from "slate";
import {HotKeyConfig} from "./types";
import {getCurrentTextNode} from "../utils";

export const mathConfig: HotKeyConfig[] = [{
  hotKey: 'mod+shift+e',
  action: (editor, event) => {
    const { selection } = editor;
    const [node] = getCurrentTextNode(editor);
    if (selection && !Range.isCollapsed(selection) && node.type === 'formatted') {
      const text = Editor.string(editor, selection);
      ['bold', 'code', 'italic', 'underline', 'highlight'].forEach((type) => {
        Editor.removeMark(editor, type);
      });
      editor.deleteBackward('character');
      Transforms.wrapNodes(editor, {
        type: 'inline-math',
        tex: text,
        children: [{
          type: 'formatted',
          text: ''
        }]
      }, {
        at: selection,
        split: true
      })
    }
    event.preventDefault();
  }
}]
