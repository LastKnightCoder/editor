import { useEffect, useRef, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { captureEditorSubmission, type Submission } from "@tau/editor/api";
import { Editor, Element, Node, Range, Text, Transforms, type BaseRange } from "slate";
import { ReactEditor } from "slate-react";
import type { ContentLinkTarget } from "./contentLinkModel";
import { wrapContentLink } from "./contentLinkTransforms";

export interface ContentMentionRequest {
  signal: AbortSignal;
  select(result: ContentLinkTarget): boolean;
  cancel(): void;
}

export function canMentionAtSelection(editor: Editor): boolean {
  if (!editor.selection || !Range.isCollapsed(editor.selection) || ReactEditor.isReadOnly(editor))
    return false;
  const blocked = Editor.above(editor, {
    at: editor.selection,
    voids: true,
    match: node =>
      Element.isElement(node) &&
      (Editor.isVoid(editor, node) ||
        ["code-block", "code-line", "link", "content-link", "inline-math"].includes(node.type)),
  });
  if (blocked) return false;
  const leaf = Node.get(editor, editor.selection.anchor.path);
  return Text.isText(leaf) && !(leaf as { code?: boolean }).code;
}

/** 只替换捕获的 @，后来的选区及相邻新输入不参与替换。 */
export function captureContentMention(
  editor: Editor,
  range: BaseRange,
  valid: () => boolean,
  submission: Submission<void> = captureEditorSubmission(editor)
): ContentMentionRequest {
  const location = Editor.rangeRef(editor, range, { affinity: "inward" });
  const controller = new AbortController();
  let finished = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    location.unref();
    submission.signal.removeEventListener("abort", cancel);
    submission.dispose();
    controller.abort();
  };
  submission.signal.addEventListener("abort", cancel, { once: true });
  if (submission.signal.aborted) cancel();
  return {
    signal: controller.signal,
    cancel,
    select(result) {
      const current = location.current;
      if (
        finished ||
        !valid() ||
        !current ||
        Range.isCollapsed(current) ||
        !Node.has(editor, current.anchor.path) ||
        !Node.has(editor, current.focus.path) ||
        Editor.string(editor, current) !== "@"
      ) {
        cancel();
        return false;
      }
      let applied = false;
      try {
        const outcome = submission.commit(() => {
          Editor.withoutNormalizing(editor, () => {
            Transforms.select(editor, current);
            Transforms.delete(editor);
            wrapContentLink(editor, result);
          });
          applied = true;
        });
        return applied && outcome.status === "committed";
      } finally {
        cancel();
      }
    },
  };
}

type ContentMentionOptions = {
  editorRef: RefObject<EditorRef | null>;
  documentKey: unknown;
  enabled: boolean;
  onRequest(request: ContentMentionRequest): void;
};

export function useContentMention(options: ContentMentionOptions): void {
  const { editorRef, documentKey, enabled } = options;
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    if (!enabled || !documentKey) return;
    const editor = editorRef.current?.getEditor();
    const editable = editorRef.current?.getEditableElement();
    if (!editor || !editable) return;
    let composing = false;
    let compositionFrame = 0;
    let compositionCommit = false;
    let pending: ContentMentionRequest | undefined;
    let prepare: (() => void) | undefined;
    const valid = () =>
      current.current.enabled &&
      current.current.documentKey === documentKey &&
      current.current.editorRef.current?.getEditor() === editor;
    const startComposition = () => {
      composing = true;
      prepare?.();
    };
    const endComposition = () => {
      composing = false;
      compositionCommit = true;
      window.cancelAnimationFrame(compositionFrame);
      compositionFrame = window.requestAnimationFrame(() => {
        compositionCommit = false;
      });
    };
    const beforeInput = (event: InputEvent) => {
      if (
        pending ||
        prepare ||
        composing ||
        compositionCommit ||
        event.isComposing ||
        event.inputType !== "insertText" ||
        event.data !== "@" ||
        !valid() ||
        !canMentionAtSelection(editor) ||
        !(event.target instanceof HTMLElement) ||
        event.target.closest("[data-slate-editor]") !== editable ||
        event.target.closest("input,textarea,[contenteditable=false]")
      )
        return;
      const selection = editor.selection;
      if (!selection) return;
      const point = Editor.pointRef(editor, selection.anchor, { affinity: "backward" });
      const submission = captureEditorSubmission(editor);
      let frame = 0;
      const discard = () => {
        window.cancelAnimationFrame(frame);
        point.unref();
        submission.dispose();
        prepare = undefined;
      };
      prepare = discard;
      frame = window.requestAnimationFrame(() => {
        prepare = undefined;
        const start = point.unref();
        if (!valid() || submission.check() || !start || !Node.has(editor, start.path)) {
          submission.dispose();
          return;
        }
        const end = Editor.after(editor, start, { distance: 1, unit: "offset" });
        const range = end ? { anchor: start, focus: end } : null;
        if (!range || Editor.string(editor, range) !== "@") {
          submission.dispose();
          return;
        }
        pending = captureContentMention(editor, range, valid, submission);
        pending.signal.addEventListener(
          "abort",
          () => {
            pending = undefined;
          },
          { once: true }
        );
        current.current.onRequest(pending);
      });
    };
    editable.addEventListener("compositionstart", startComposition, true);
    editable.addEventListener("compositionend", endComposition, true);
    editable.addEventListener("beforeinput", beforeInput, true);
    return () => {
      editable.removeEventListener("compositionstart", startComposition, true);
      editable.removeEventListener("compositionend", endComposition, true);
      editable.removeEventListener("beforeinput", beforeInput, true);
      prepare?.();
      pending?.cancel();
      window.cancelAnimationFrame(compositionFrame);
    };
  }, [editorRef, documentKey, enabled]);
}
