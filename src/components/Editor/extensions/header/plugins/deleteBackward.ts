import { Editor, Element as SlateElement, Range, Transforms } from 'slate';

// 删除标题时，将标题转换为 paragraph，而不是移到上一个块中
export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'header',
      });
      if (match) {
        const [, path] = match;
        const isStart = Editor.isStart(editor, selection.anchor, path);
        if (isStart) {
          // 将标题转换为 paragraph，而不是将标题移到上一个块中
          Transforms.setNodes(editor, {
            type: 'paragraph'
          });
          Transforms.unsetNodes(editor, 'level');
          return;
        }
      }
    }
    deleteBackward(unit);
  }

  return editor;
}
