import { Editor, Path, Transforms, Element, Node } from "slate";

import { isParagraphAndEmpty, isCollapsed, replaceNode } from "./editor";

import { BlockElement } from "../types";

import { getSelectionSnapshot, isSelectionSnapshotUnchanged } from "./selectionSnapshot";

interface InsertElementOptions {
  select?: boolean;
  reverse?: boolean;
}

export const focusInsertedPreviewElement = (editor: Editor, path?: Path, retry = 5) => {
  if (!path || retry <= 0 || typeof document === "undefined") {
    return;
  }
  const selectionSnapshot = getSelectionSnapshot(editor.selection);
  if (!selectionSnapshot) {
    return;
  }
  const focusEditor = (leftTryCount: number) => {
    if (leftTryCount <= 0 || !isSelectionSnapshotUnchanged(editor, selectionSnapshot)) {
      return;
    }
    setTimeout(() => {
      if (!isSelectionSnapshotUnchanged(editor, selectionSnapshot)) {
        return;
      }
      let node: Node | undefined;
      try {
        node = Node.get(editor, path);
      } catch {
        node = undefined;
      }
      if (node && Element.isElement(node)) {
        const focusEvent = new CustomEvent("preview-editor-focus", {
          detail: {
            element: node,
            path,
          },
        });
        document.dispatchEvent(focusEvent);
      }
      focusEditor(leftTryCount - 1);
    }, 80);
  };
  focusEditor(retry);
};

export const setOrInsertNode = (
  editor: Editor,
  node: BlockElement,
  options: InsertElementOptions = {}
) => {
  if (!isCollapsed(editor)) {
    return;
  }
  const [match] = Editor.nodes(editor, {
    match: n => n.type === "paragraph",
    mode: "lowest",
  });
  if (!match) {
    return;
  }
  if (isParagraphAndEmpty(editor)) {
    return replaceNode(editor, node, n => n.type === "paragraph", options);
  } else {
    Transforms.insertNodes(editor, node, options);
    return Path.next(match[1]);
  }
};
