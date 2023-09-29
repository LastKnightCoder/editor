import { Editor, Transforms } from 'slate';

const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'header'
    })
    if (match) {
      // 标题换行时，插入段落，而不是标题
      insertBreak();
      Transforms.setNodes(editor, { type: 'paragraph' });
      Transforms.unsetNodes(editor, 'level');
      return;
    }
    insertBreak();
  }

  return editor;
}

export default insertBreak;
