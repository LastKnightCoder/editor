import { HotKeyConfig } from "./types";
import { Editor, Element as SlateElement, Range, Transforms } from "slate";
import { isParagraphEmpty } from "../utils";
import { ParagraphElement } from "../custom-types";
import { v4 as getUuid } from "uuid";
import { message } from "antd";

export const codeBlockConfig: HotKeyConfig[] = [{
  hotKey: 'mod+`',
  action: (editor) => {
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
          const uuid = getUuid();
          Transforms.setNodes(editor, { type: 'code-block', code: '', language: 'javascript', uuid, children: [{ type: 'formatted', text: '' }] });
          // 聚焦到 code-block
          setTimeout(() => {
            const codeMirrorEditor = editor.codeBlockMap.get(uuid);
            if (codeMirrorEditor) {
              // focus 失效，不知道为什么
              codeMirrorEditor.focus();
            }
          }, 0);
        } else {
          message.error('段落不为空');
        }
      } else {
        message.error('请在段落开头输入');
      }
    }
  }
}]