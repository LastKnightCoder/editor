import {Editor, Transforms} from "slate";

const header = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'header'
    })
    if (match) {
      insertBreak();
      Transforms.setNodes(editor, { type: 'paragraph' });
      Transforms.unsetNodes(editor, 'level');
      return;
    }
    insertBreak();
  }

  return editor;
}

export default header;