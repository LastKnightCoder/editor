import {Editor, Element as SlateElement, Range, Transforms} from "slate";
import {CodeBlockElement} from "../../types";
import {isAtParagraphStart, isParagraphAndEmpty} from "../../utils";

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
        if (isAtParagraphStart(editor)) {
          // 如果前一个是 code-block，删除当前 paragraph，将光标移动到 code-block 的末尾
          const prevPath = Editor.before(editor, path);
          if (prevPath) {
            const [prevMatch] = Editor.nodes(editor, {
              at: prevPath,
              match: n => SlateElement.isElement(n) && n.type === 'code-block',
            });
            if (prevMatch) {
              if (isParagraphAndEmpty(editor)) {
                Transforms.removeNodes(editor, { at: path });
              }
              const [element] = prevMatch;
              const codeBlockMap = editor.codeBlockMap;
              const codeMirrorEditor = codeBlockMap.get((element as CodeBlockElement).uuid);
              if (codeMirrorEditor) {
                codeMirrorEditor.focus();
              }
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