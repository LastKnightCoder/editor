import { createElement } from "react";
import { Editor, Element, Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { PreviewWithEditor, useReportPreviewError } from "@tau/editor-source-view";
import {
  useEditorTheme,
  setOrInsertNode,
  focusInsertedPreviewElement,
  isAtParagraphStart,
  isParagraphAndEmpty,
} from "@tau/editor/api";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { configureSourceEditor } from "./source-editor";

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
