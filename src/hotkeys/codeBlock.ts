import { HotKeyConfig } from "./types";
import { Editor, Element as SlateElement, Range } from "slate";
import {insertCodeBlock, isParagraphEmpty} from "../utils";
import { ParagraphElement } from "../custom-types";
import { message } from "antd";


export const codeBlockConfig: HotKeyConfig[] = [{
  hotKey: 'mod+`',
  action: (editor, event) => {
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
          insertCodeBlock(editor, 'javascript');
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