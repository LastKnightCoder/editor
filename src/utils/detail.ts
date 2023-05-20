import {Editor, Transforms} from "slate";
import {ReactEditor} from "slate-react";

export const insertDetails = (editor: Editor) => {
  // 如果当前段落是空的，删除该段落
  const [paragraph] = Editor.nodes(editor, {
    match: n => n.type === 'paragraph',
  });
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (paragraph && paragraph[0].children.length === 1 && paragraph[0].children[0].text === '') {
    Transforms.removeNodes(editor, {
      at: paragraph[1],
    });
  }
  Transforms.insertNodes(editor, {
    type: 'detail',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }]
    }],
  });
  const [detail] = Editor.nodes(editor, {
    match: n => n.type === 'detail',
  });
  if (!detail) {
    return;
  }

  setTimeout(() => {
    ReactEditor.focus(editor);
    Transforms.select(editor, [...detail[1], 0, 0])
  }, 200)
}
