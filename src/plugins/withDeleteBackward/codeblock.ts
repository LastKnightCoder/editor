import {Editor, Element as SlateElement, Point, Range, Transforms} from "slate";
import {CodeBlockElement} from "../../custom-types";

const codeblock = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && editor.isBlock(n),
      });
      if (match) {
        const [, path] = match;
        const start = Editor.start(editor, path);
        if (Point.equals(selection.anchor, start)) {
          // 如果前一个是 code-block，删除当前 paragraph，将光标移动到 code-block 的末尾
          const prevPath = Editor.before(editor, path);
          if (prevPath) {
            const [prevMatch] = Editor.nodes(editor, {
              at: prevPath,
              match: n => SlateElement.isElement(n) && n.type === 'code-block',
            });
            if (prevMatch) {
              Editor.nodes(editor, {
                match: n => SlateElement.isElement(n) && n.type === 'paragraph',
              });
              Transforms.removeNodes(editor, { at: path });
              const [element] = prevMatch;
              const codeBlockMap = editor.codeBlockMap;
              const codeMirrorEditor = codeBlockMap.get((element as CodeBlockElement).uuid);
              codeMirrorEditor && codeMirrorEditor.focus();
              return;
            }
          }
        }
      }
    }
    deleteBackward(unit);
  }

  return editor;
}

export default codeblock;