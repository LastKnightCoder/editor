import { createElement, useEffect, useRef } from "react";
import { Editor, Element, Transforms } from "slate";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { PreviewWithEditor, useReportPreviewError } from "@tau/editor-source-view";
import {
  IElementEditingPolicy,
  useEditorTheme,
  setOrInsertNode,
  focusInsertedPreviewElement,
  isAtParagraphStart,
  isParagraphAndEmpty,
  captureElementSubmission,
  InlineChromiumBugfix,
} from "@tau/editor/api";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { useElementFrame } from "./src/core/components/ElementFrame";
import { openImageLightbox } from "./src/extensions/media/src/stores/useImageLightboxStore";
import {
  MediaToolbar,
  ToolbarButton,
  ToolbarGap,
} from "./src/extensions/media/src/components/MediaToolbar";
import type { SourceEditorRuntime, InlineSourceRuntime, ElementRuntime } from "./source-contracts";

export const elementRuntime: ElementRuntime = {
  useElement(element) {
    const editor = useSlateStatic();
    const editorReadOnly = useReadOnly();
    const readOnly =
      editorReadOnly ||
      editor.tryGetService(IElementEditingPolicy)?.canEdit(element.type) === false;
    const frame = useElementFrame();
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
      selected: frame?.selected ?? false,
      update: properties => commit(path => Transforms.setNodes(editor, properties, { at: path })),
      remove: () => commit(path => Transforms.removeNodes(editor, { at: path })),
      select: () => frame?.select(),
      openMenu: position => frame?.openMenu(position),
    };
  },
  useMediaViewer(element) {
    const editor = useSlateStatic();
    return index => openImageLightbox(editor, element, index);
  },
  BlockToolbar: props => createElement(MediaToolbar, props),
  BlockToolbarButton: props => createElement(ToolbarButton, props),
  BlockToolbarGap: () => createElement(ToolbarGap),
};

export const inlineSourceRuntime: InlineSourceRuntime = {
  InlineSourceBoundary: () => createElement(InlineChromiumBugfix),
  insertInlineSource(editor, element) {
    if (!ReactEditor.isReadOnly(editor)) Transforms.insertNodes(editor, element);
  },
  useInlineSource(element) {
    const editor = useSlateStatic();
    const access = elementRuntime.useElement(element);
    return {
      readOnly: access.readOnly,
      compiler: editor.tryGetService(IRuntimeStyleCompiler),
      update: access.update,
      remove: access.remove,
    };
  },
};

export const sourceEditorRuntime: SourceEditorRuntime = {
  SourceBlockEditor: props => createElement(PreviewWithEditor, props),
  useSourceBlock(element) {
    const editor = useSlateStatic();
    const theme = useEditorTheme();
    const access = elementRuntime.useElement(element);
    return {
      theme,
      compiler: editor.tryGetService(IRuntimeStyleCompiler),
      update: access.update,
    };
  },
  useReportPreviewError,
  insertSourceBlock(editor, element, line) {
    if (
      ReactEditor.isReadOnly(editor) ||
      editor.tryGetService(IElementEditingPolicy)?.canEdit(element.type) === false
    )
      throw new Error("当前节点不允许插入或编辑");
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
};

export const SourceBlockEditor: SourceEditorRuntime["SourceBlockEditor"] =
  sourceEditorRuntime.SourceBlockEditor;
export const useSourceBlock: SourceEditorRuntime["useSourceBlock"] =
  sourceEditorRuntime.useSourceBlock;
export const useSourcePreviewError: SourceEditorRuntime["useReportPreviewError"] =
  sourceEditorRuntime.useReportPreviewError;
export const insertSourceBlock: SourceEditorRuntime["insertSourceBlock"] =
  sourceEditorRuntime.insertSourceBlock;
export const sourceBlockParagraphBehavior: SourceEditorRuntime["sourceBlockParagraphBehavior"] =
  sourceEditorRuntime.sourceBlockParagraphBehavior;
export const useInlineSource: InlineSourceRuntime["useInlineSource"] =
  inlineSourceRuntime.useInlineSource;
export const insertInlineSource: InlineSourceRuntime["insertInlineSource"] =
  inlineSourceRuntime.insertInlineSource;
export const InlineSourceBoundary: InlineSourceRuntime["InlineSourceBoundary"] =
  inlineSourceRuntime.InlineSourceBoundary;
