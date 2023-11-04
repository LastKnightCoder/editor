import { Editor, Transforms } from "slate";
import { CalloutElement } from "@/components/Editor/types";
import { isParagraphAndEmpty } from "@/components/Editor/utils";

// 如果 callout 在第一行，且内容为空时，删除 callout 时，转化为 paragraph
export const deleteFirstLineCallout = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'callout',
      mode: 'lowest',
    });
    if (!match) {
      return deleteBackward(unit);
    }
    const [node, path] = match;
    const isFirst = path[path.length - 1] === 0;
    const isEmpty =
      (node as CalloutElement).children.length === 1 &&
      (node as CalloutElement).children[0].type === 'paragraph' &&
      isParagraphAndEmpty(editor);
    if (isFirst && isEmpty) {
      Transforms.delete(editor, {
        at: path,
      })
      Transforms.insertNodes(editor, {
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }],
      }, {
        at: path,
        select: true,
      })
      return;
    }

    return deleteBackward(unit);
  }

  return editor;
}