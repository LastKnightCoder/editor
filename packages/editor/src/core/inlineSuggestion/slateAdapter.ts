import { Element, Editor, Node, Path, Point, Range, Text, Transforms } from "slate";
import type { Descendant, NodeEntry } from "slate";
import { ReactEditor } from "slate-react";
import { canEditElement } from "../api/elementVersions";
import { submissionScopeSignal } from "../kit/submissionScope";
import { withNewUndoStep } from "../utils/undoStep";
import type { InlineSuggestionEditorPort } from "./controller";

export interface Stamp {
  readonly scope: AbortSignal;
  readonly children: Descendant[];
  readonly point: Point;
  readonly anchorStart: number;
}

const CONTEXT_LENGTH = 512;
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;

function currentPoint(editor: Editor): Point | null {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return null;
  const point = selection.anchor;
  // 只在顶层普通段落的直接文本上提示，让列表、表格和行内元素保留自己的键盘语义。
  if (point.path.length !== 2) return null;
  const paragraph = Node.getIf(editor, point.path.slice(0, 1));
  const leaf = Node.getIf(editor, point.path);
  if (
    !Element.isElement(paragraph) ||
    paragraph.type !== "paragraph" ||
    !canEditElement(editor, paragraph) ||
    !Text.isText(leaf) ||
    leaf.text.length < point.offset
  )
    return null;
  return point;
}

export function createSlateSuggestionPort(editor: Editor): InlineSuggestionEditorPort<Stamp> {
  const canSuggest = () => {
    const scope = submissionScopeSignal(editor);
    if (
      !scope ||
      scope.aborted ||
      ReactEditor.isReadOnly(editor) ||
      ReactEditor.isComposing(editor) ||
      !ReactEditor.isFocused(editor)
    )
      return null;
    const editable = ReactEditor.toDOMNode(editor, editor);
    return editable.ownerDocument.activeElement === editable &&
      !editable.closest("[inert], [hidden]")
      ? scope
      : null;
  };

  const isCurrent = (stamp: Stamp) => {
    if (editor.children !== stamp.children || canSuggest() !== stamp.scope) return false;
    const point = currentPoint(editor);
    return point !== null && Point.equals(point, stamp.point);
  };

  return {
    capture() {
      const scope = canSuggest();
      const point = scope && currentPoint(editor);
      if (!scope || !point) return null;
      const path = point.path.slice(0, 1);
      const leaf = Node.leaf(editor, point.path);
      const previous = point.offset && segmenter?.segment(leaf.text).containing(point.offset - 1);
      if (
        point.offset > 0 &&
        (!previous || previous.index + previous.segment.length !== point.offset)
      )
        return null;
      return {
        stamp: {
          scope,
          point,
          children: editor.children,
          anchorStart: previous ? previous.index : 0,
        },
        context: {
          before: Editor.string(editor, { anchor: Editor.start(editor, path), focus: point }).slice(
            -CONTEXT_LENGTH
          ),
          after: Editor.string(editor, { anchor: point, focus: Editor.end(editor, path) }).slice(
            0,
            CONTEXT_LENGTH
          ),
        },
      };
    },
    isCurrent,
    tryInsert(stamp, text) {
      if (!isCurrent(stamp)) return false;
      withNewUndoStep(editor, () => Transforms.insertText(editor, text), { isolate: true });
      return editor.children !== stamp.children;
    },
  };
}

export function decorateInlineSuggestion(stamp: Stamp, [node, path]: NodeEntry): Range[] {
  if (!Text.isText(node) || !Path.equals(path, stamp.point.path)) return [];
  const range = {
    anchor: { path, offset: stamp.anchorStart },
    focus: stamp.point,
    tauInlineSuggestionAnchor: true,
  };
  return [range];
}
