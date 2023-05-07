import { Editor, Transforms } from "slate";
import { v4 as getUuid } from 'uuid';

export const insertCodeBlock = (editor: Editor, language = 'javascript') => {
  const uuid = getUuid();
  Transforms.setNodes(editor, { type: 'code-block', code: '', language: language, uuid, children: [{ type: 'formatted', text: '' }] });
  // 聚焦到 code-block
  setTimeout(() => {
    const codeMirrorEditor = editor.codeBlockMap.get(uuid);
    if (codeMirrorEditor) {
      codeMirrorEditor.focus();
    }
  }, 0);
}