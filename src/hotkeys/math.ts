import {Editor, Element as SlateElement, Range, Transforms} from "slate";
import {HotKeyConfig} from "./types";
import {getCurrentTextNode, isParagraphEmpty} from "../utils";
import {ParagraphElement} from "../custom-types";
import {message} from "antd";

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
      const [element, path] = match;
      if (Editor.isStart(editor, selection.anchor, path)) {
        if (isParagraphEmpty(element as ParagraphElement)) {
          Transforms.insertNodes(editor, {
            type: 'block-math',
            tex: 'f(x)=x^2',
            children: [{
              type: 'formatted',
              text: ''
            }]
          });
          // 防止失去焦点
          event.preventDefault();
        } else {
          message.error('段落不为空');
        }
      } else {
        message.error('请在段落开头输入');
      }
    }
  }
}]


