import { createElement, useEffect, useRef } from "react";
import { Editor, Element, Transforms } from "slate";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { PreviewWithEditor, useReportPreviewError } from "@tau/editor-source-view";
import {
  useEditorTheme,
  setOrInsertNode,
  focusInsertedPreviewElement,
  isAtParagraphStart,
  isParagraphAndEmpty,
  captureElementSubmission,
  InlineChromiumBugfix,
} from "@tau/editor/api";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { configureSourceEditor } from "./source-editor";
import { configureInlineSource } from "./inline-source";

configureInlineSource({
  InlineSourceBoundary: () => createElement(InlineChromiumBugfix),
  insertInlineSource(editor, element) {
    if (!ReactEditor.isReadOnly(editor)) Transforms.insertNodes(editor, element);
  },
  useInlineSource(element) {
    const editor = useSlateStatic();
    const readOnly = useReadOnly();
    const active = useRef(true);
    const state = useRef({ readOnly, element });
    state.current = { readOnly, element };
    useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
      };
    }, []);
    const commit = (write: (path: number[]) => void) => {
      if (!active.current || state.current.readOnly || state.current.element !== element) return;
      let path;
      try {
        path = ReactEditor.findPath(editor, element);
      } catch {
        return;
      }
      const submission = captureElementSubmission(editor, { element, path });
      try {
        submission.commit(({ path }) => {
          write(path);
          return undefined;
        });
      } finally {
        submission.dispose();
      }
    };
    return {
      readOnly,
      compiler: editor.tryGetService(IRuntimeStyleCompiler),
      update: properties => commit(path => Transforms.setNodes(editor, properties, { at: path })),
      remove: () => commit(path => Transforms.removeNodes(editor, { at: path })),
    };
  },
});

configureSourceEditor({
  SourceBlockEditor: props => createElement(PreviewWithEditor, props),
  useSourceBlock(element) {
    const editor = useSlateStatic();
    const theme = useEditorTheme();
    return {
      theme,
      compiler: editor.tryGetService(IRuntimeStyleCompiler),
      update: properties =>
        Transforms.setNodes(editor, properties, { at: ReactEditor.findPath(editor, element) }),
    };
  },
  useReportPreviewError,
  insertSourceBlock(editor, element, line) {
    const path = setOrInsertNode(editor, element);
    focusInsertedPreviewElement(editor, path, line);
    return path;
  },
  sourceBlockParagraphBehavior(type) {
    return {
      deleteBackward(editor, [, path]) {
        if (!isAtParagraphStart(editor)) return false;
        const before = Editor.before(editor, path);
        if (!before) return false;
        const [previous] = Editor.nodes(editor, {
          at: before,
          match: node => Element.isElement(node) && node.type === type,
        });
        if (!previous) return false;
        if (isParagraphAndEmpty(editor)) Transforms.removeNodes(editor, { at: path });
        document.dispatchEvent(new CustomEvent("preview-editor-focus", { detail: previous[0] }));
        return true;
      },
    };
  },
});
