import { mobileEditorTranslator } from "./i18n";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Transforms,
  type BaseSelection,
  type Path,
} from "slate";
import { ReactEditor } from "slate-react";

import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import {
  CONTENT_LINK_TYPE,
  readContentLinkTarget,
  type ContentLinkPickerIntent,
  type ContentLinkTarget,
} from "../editorExtensions/contentLinkModel";
import { retargetContentLink, wrapContentLink } from "../editorExtensions/contentLinkTransforms";
import type { ContentMentionRequest } from "../editorExtensions/useContentMention";
import { resolveContentLinkContext } from "./editingContext";
import { toast } from "../../../components/toast";
import { restoreSelectionAndFocus } from "./toolbarActions";
import { getEditorFromRef } from "./useToolbarSelectionState";

const t = mobileEditorTranslator.t;

const INSERT_PICKER_INTENT: ContentLinkPickerIntent = { mode: "insert", text: "" };

type ContentLinkControllerOptions = {
  editorRef: RefObject<EditorRef | null>;
  openSheetNextTick: (open: () => void) => void;
  markSelectionDirty: () => void;
  restoreEditorSelection: () => SlateEditor | null;
  dismissKeyboard: () => void;
  lastSelectionRef: RefObject<BaseSelection | null>;
};

/** 内容链接域：选择器开合与 @ 引用会话、引用预览；refs 与 setter 供 executeAction 打开选择器复用 */
export function useContentLinkController({
  editorRef,
  openSheetNextTick,
  markSelectionDirty,
  restoreEditorSelection,
  dismissKeyboard,
  lastSelectionRef,
}: ContentLinkControllerOptions) {
  const [isContentLinkPickerOpen, setIsContentLinkPickerOpen] = useState(false);
  const [contentLinkPickerIntent, setContentLinkPickerIntent] =
    useState<ContentLinkPickerIntent>(INSERT_PICKER_INTENT);
  const [contentLinkPreview, setContentLinkPreview] = useState<ContentLinkTarget | null>(null);

  const pendingContentLinkSelectionRef = useRef<BaseSelection | null>(null);
  const contentLinkRetargetPathRef = useRef<Path | null>(null);
  const mentionRef = useRef<ContentMentionRequest | null>(null);
  const contentLinkPreviewSelectionRef = useRef<BaseSelection | null>(null);

  const handleCloseContentLinkPicker = useCallback(() => {
    const mention = mentionRef.current;
    mentionRef.current = null;
    mention?.cancel();
    setIsContentLinkPickerOpen(false);
    pendingContentLinkSelectionRef.current = null;
    contentLinkRetargetPathRef.current = null;
    markSelectionDirty();
  }, [markSelectionDirty]);

  const openContentMention = useCallback(
    (request: ContentMentionRequest) => {
      mentionRef.current?.cancel();
      mentionRef.current = request;
      pendingContentLinkSelectionRef.current = null;
      contentLinkRetargetPathRef.current = null;
      setContentLinkPickerIntent(INSERT_PICKER_INTENT);
      request.signal.addEventListener(
        "abort",
        () => {
          if (mentionRef.current === request) {
            mentionRef.current = null;
            setIsContentLinkPickerOpen(false);
          }
        },
        { once: true }
      );
      openSheetNextTick(() => {
        if (!request.signal.aborted && mentionRef.current === request)
          setIsContentLinkPickerOpen(true);
      });
    },
    [openSheetNextTick]
  );
  useEffect(() => () => mentionRef.current?.cancel(), []);

  const handleSelectContentLink = useCallback(
    (result: ContentLinkPickerResult) => {
      const mention = mentionRef.current;
      if (mention) {
        mentionRef.current = null;
        const applied = mention.select(result);
        setIsContentLinkPickerOpen(false);
        if (!applied)
          toast({
            type: "warning",
            get text() {
              return t("reference.changed");
            },
          });
        else {
          const editor = getEditorFromRef(editorRef);
          if (editor) {
            ReactEditor.focus(editor as ReactEditor);
            lastSelectionRef.current = editor.selection;
          }
        }
        markSelectionDirty();
        return;
      }
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }

      const selectionToRestore = pendingContentLinkSelectionRef.current ?? lastSelectionRef.current;
      if (selectionToRestore) {
        Transforms.select(editor, selectionToRestore);
      }

      const retargetPath = contentLinkRetargetPathRef.current;
      contentLinkRetargetPathRef.current = null;
      if (retargetPath) {
        const node = SlateNode.has(editor, retargetPath)
          ? SlateNode.get(editor, retargetPath)
          : null;
        if (
          SlateElement.isElement(node) &&
          (node as { type?: string }).type === CONTENT_LINK_TYPE
        ) {
          retargetContentLink(editor, retargetPath, result);
        }
      } else {
        wrapContentLink(editor, result);
      }

      ReactEditor.focus(editor as ReactEditor);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      pendingContentLinkSelectionRef.current = null;
      setIsContentLinkPickerOpen(false);
      markSelectionDirty();
    },
    [editorRef, markSelectionDirty, restoreEditorSelection]
  );

  const retargetContentLinkAtCursor = useCallback(() => {
    mentionRef.current?.cancel();
    const editor = getEditorFromRef(editorRef);
    const context = editor ? resolveContentLinkContext(editor) : null;
    if (!editor || !context) return;
    pendingContentLinkSelectionRef.current = editor.selection ?? lastSelectionRef.current;
    contentLinkRetargetPathRef.current = context.path;
    setContentLinkPickerIntent({ mode: "replace", text: SlateNode.string(context.element) });
    openSheetNextTick(() => setIsContentLinkPickerOpen(true));
  }, [editorRef, openSheetNextTick]);

  const openContentLinkPreview = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    const context = editor ? resolveContentLinkContext(editor) : null;
    if (!editor || !context) return;
    contentLinkPreviewSelectionRef.current = editor.selection ?? lastSelectionRef.current;
    const target = readContentLinkTarget(context.element);
    // 先收起键盘，面板才不会被键盘挡住
    dismissKeyboard();
    openSheetNextTick(() => setContentLinkPreview(target));
  }, [dismissKeyboard, editorRef, openSheetNextTick]);

  const closeContentLinkPreview = useCallback(
    (reason?: "open") => {
      setContentLinkPreview(null);
      const saved = contentLinkPreviewSelectionRef.current;
      contentLinkPreviewSelectionRef.current = null;
      const editor = getEditorFromRef(editorRef);
      if (reason === "open" || !editor) return;
      if (saved) {
        Transforms.select(editor, saved);
      }
      const nextSelection = restoreSelectionAndFocus(editor, saved);
      if (nextSelection) {
        lastSelectionRef.current = nextSelection;
      }
      markSelectionDirty();
    },
    [editorRef, markSelectionDirty]
  );

  return {
    isContentLinkPickerOpen,
    contentLinkPickerIntent,
    contentLinkPreview,
    mentionRef,
    pendingContentLinkSelectionRef,
    contentLinkRetargetPathRef,
    setIsContentLinkPickerOpen,
    setContentLinkPickerIntent,
    openContentMention,
    handleCloseContentLinkPicker,
    handleSelectContentLink,
    retargetContentLinkAtCursor,
    openContentLinkPreview,
    closeContentLinkPreview,
  };
}
