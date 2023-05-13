import { Editor } from "slate";

export const withQuitMode = (editor: Editor) => {
  const { insertText } = editor;
  editor.insertText = (text) => {
    // 会在按下 esc 进行记录，如果按下 esc，后面的输入应该为普通文本
    // 比如在链接后面输入，按下 esc，后面输出的应该是普通文本，而不是链接
    // 目前没想到有好的办法直接退出链接模式，所以只能通过 escMode 来记录
    if (editor.escMode) {
      editor.escMode = false;
      editor.insertNode({ type: 'formatted', text });
      return;
    }

    insertText(text);
  }

  return editor;
}
