import { Editor, NodeEntry, Transforms } from "slate";
import { MultiColumnContainerElement, MultiColumnItemElement } from "@/components/Editor/types";

export const getCurrentColumnIndex = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'multi-column-item',
    mode: 'lowest'
  })
  if (!match) {
    return {
      isColumnLayout: false,
      index: 0,
    }
  }

  const [, path] = match as NodeEntry<MultiColumnItemElement>;
  return {
    isColumnLayout: true,
    index: path[path.length - 1],
  };
}

export const insertColumnAt = (editor: Editor, index: number) => {
  if (index < 0) return;
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'multi-column-container',
    mode: 'lowest'
  });
  if (!match) return;
  const [ele, containerPath] = match as NodeEntry<MultiColumnContainerElement>;
  if (index > ele.children.length) return;

  const insertPath = [...containerPath, index];

  Transforms.insertNodes(editor, {
    type: 'multi-column-item',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: ''
      }]
    }]
  }, {
    at: insertPath,
    select: true
  });
}

export const insertColumnLeft = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;
  insertColumnAt(editor, index);
}

export const insertColumnRight = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;
  insertColumnAt(editor, index + 1);
}

export const deleteColumnAt = (editor: Editor, index: number) => {
  if (index < 0) return;
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'multi-column-container',
    mode: 'lowest'
  });
  if (!match) return;
  const [ele, containerPath] = match as NodeEntry<MultiColumnContainerElement>;
  if (index >= ele.children.length) return;

  const deletePath = [...containerPath, index];
  Transforms.delete(editor, {
    at: deletePath
  })
}

export const deleteColumnLeft = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;
  if (index <= 0) return;
  deleteColumnAt(editor, index - 1);
}

export const deleteColumnRight = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;

  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'multi-column-container',
    mode: 'lowest'
  });
  if (!match) return;

  const [ele] = match as NodeEntry<MultiColumnContainerElement>;
  if (index >= ele.children.length - 1) return;

  deleteColumnAt(editor, index + 1);
}
