import { type Editor, Node, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { findPathSafely } from "@tau/editor/api";
import type { TableRowElement } from "./types";

export function moveTableRow(
  editor: Editor,
  sourceEditor: Editor,
  source: TableRowElement,
  target: TableRowElement,
  before: boolean
): boolean {
  if (sourceEditor !== editor || ReactEditor.isReadOnly(editor)) return false;
  const from = findPathSafely(editor, source),
    to = findPathSafely(editor, target);
  if (
    !from ||
    !to ||
    !from.length ||
    !to.length ||
    !Node.has(editor, from) ||
    Node.get(editor, from) !== source ||
    !Node.has(editor, to) ||
    Node.get(editor, to) !== target ||
    !Path.equals(Path.parent(from), Path.parent(to)) ||
    from[from.length - 1] === 0 ||
    Path.equals(from, to)
  )
    return false;
  const insertBefore = before && to[to.length - 1] !== 0;
  Transforms.moveNodes(editor, {
    at: from,
    to: Path.isBefore(from, to)
      ? insertBefore
        ? Path.previous(to)
        : to
      : insertBefore
        ? to
        : Path.next(to),
    voids: true,
  });
  return true;
}
