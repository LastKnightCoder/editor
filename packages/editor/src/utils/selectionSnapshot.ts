import type { Editor } from "slate";

export const getSelectionSnapshot = (selection: Editor["selection"]) => {
  if (!selection) return null;
  const anchorPath = selection.anchor.path.join(",");
  const focusPath = selection.focus.path.join(",");
  return `${anchorPath}:${selection.anchor.offset}-${focusPath}:${selection.focus.offset}`;
};

export const isSelectionSnapshotUnchanged = (editor: Editor, expectedSnapshot: string | null) =>
  !!expectedSnapshot && getSelectionSnapshot(editor.selection) === expectedSnapshot;
