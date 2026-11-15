import { INLINE_PROSE_CONTEXT_LIMIT } from "@tau/shared/inline-suggestion-limits";
import { Element, Editor, Node, Path, Point, Range, Text, Transforms } from "slate";
import type { Descendant, NodeEntry } from "slate";
import { ReactEditor } from "slate-react";
import { canEditElement, getElementVersionResolver } from "../api/elementVersions";
import { submissionScopeSignal } from "../kit/submissionScope";
import { withNewUndoStep } from "../utils/undoStep";
import type { InlineSuggestionContext, InlineSuggestionEditorPort } from "./controller";

export interface Stamp {
  readonly scope: AbortSignal;
  readonly children: Descendant[];
  readonly point: Point;
  readonly anchorStart: number;
}

const PARAGRAPH_SEPARATOR = "\n\n";
const MAX_ADJACENT_BLOCKS_PER_SIDE = 32;
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;

function limitContext(before: string, after: string, limit: number) {
  // 前文默认多占一点，另一侧用不完的预算可以借用。
  const beforeLength = Math.min(
    before.length,
    Math.max(Math.ceil((limit * 3) / 5), limit - after.length)
  );
  const afterLength = Math.min(after.length, limit - beforeLength);
  return {
    before: before.slice(before.length - beforeLength).replace(/^[\uDC00-\uDFFF]/u, ""),
    after: after.slice(0, afterLength).replace(/[\uD800-\uDBFF]$/u, ""),
  };
}

function adjacentText(editor: Editor, index: number, direction: -1 | 1, limit: number) {
  const resolve = getElementVersionResolver(editor);
  const parts = [""];
  let length = 0;
  for (let distance = 1; distance <= MAX_ADJACENT_BLOCKS_PER_SIDE && length < limit; distance++) {
    const blockIndex = index + distance * direction;
    const block = editor.children[blockIndex];
    if (!block) break;
    if (!Element.isElement(block) || (block.type !== "paragraph" && block.type !== "header"))
      continue;
    if (resolve?.(block)?.access === "none") continue;
    const text = Editor.string(editor, [blockIndex]);
    if (!text.trim()) continue;
    parts.push(text);
    length += text.length + PARAGRAPH_SEPARATOR.length;
  }
  return (direction === -1 ? parts.reverse() : parts).join(PARAGRAPH_SEPARATOR);
}

function captureContext(editor: Editor, point: Point): InlineSuggestionContext {
  const index = point.path[0];
  const path = [index];
  const before = Editor.string(editor, { anchor: Editor.start(editor, path), focus: point });
  const after = Editor.string(editor, { anchor: point, focus: Editor.end(editor, path) });
  const remaining = INLINE_PROSE_CONTEXT_LIMIT - before.length - after.length;
  if (remaining <= PARAGRAPH_SEPARATOR.length) {
    return limitContext(before, after, INLINE_PROSE_CONTEXT_LIMIT);
  }
  const nearby = limitContext(
    adjacentText(editor, index, -1, remaining),
    adjacentText(editor, index, 1, remaining),
    remaining
  );
  return {
    before: (nearby.before.length > PARAGRAPH_SEPARATOR.length ? nearby.before : "") + before,
    after: after + (nearby.after.length > PARAGRAPH_SEPARATOR.length ? nearby.after : ""),
  };
}

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
        context: captureContext(editor, point),
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
