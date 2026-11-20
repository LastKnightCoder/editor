import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Range,
  Transforms,
  type BaseSelection,
  type Path,
} from "slate";

import { toast } from "../../../components/toast";
import {
  captureTtsInsertTarget,
  selectedPlainText,
  type TtsInsertIntent,
  type TtsInsertTarget,
} from "../tts/ttsInsertTarget";
import { getEditorFromRef } from "./useToolbarSelectionState";

type TtsActionsOptions = {
  editorRef: RefObject<EditorRef | null>;
  openSheetNextTick: (open: () => void) => void;
  dismissKeyboard: () => void;
  markSelectionDirty: () => void;
  lastSelectionRef: RefObject<BaseSelection | null>;
  /** 与 useToolbarActions 共享的同一 ref 实例，写入成功提示里的「撤销」取最新 undo */
  undoRef: RefObject<() => void>;
};

/** 文字转语音域：写入位置锁定、面板开合与插入成功回执 */
export function useTtsActions({
  editorRef,
  openSheetNextTick,
  dismissKeyboard,
  markSelectionDirty,
  lastSelectionRef,
  undoRef,
}: TtsActionsOptions) {
  const [ttsTarget, setTtsTarget] = useState<TtsInsertTarget | null>(null);
  const ttsTargetRef = useRef<TtsInsertTarget | null>(null);

  /** 锁定写入位置后下一拍打开面板；位置不可写时提示，不打开 */
  const openTts = useCallback(
    (editor: SlateEditor, intent: TtsInsertIntent) => {
      const target = captureTtsInsertTarget(editor, intent);
      if (!target) {
        toast.warning("当前位置无法插入音频，请把光标放到正文空行后重试");
        return;
      }
      ttsTargetRef.current?.dispose();
      ttsTargetRef.current = target;
      openSheetNextTick(() => {
        if (ttsTargetRef.current === target) setTtsTarget(target);
      });
    },
    [openSheetNextTick]
  );
  useEffect(() => () => ttsTargetRef.current?.dispose(), []);

  const openTtsForSelection = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    const selection = editor.selection ?? lastSelectionRef.current;
    if (!selection || Range.isCollapsed(selection)) return;
    Transforms.select(editor, selection);
    lastSelectionRef.current = selection;
    const text = selectedPlainText(editor);
    // 面板里要输入，先收起正文键盘；选区保留用于定位插入点
    dismissKeyboard();
    openTts(editor, { kind: "after-selection", text });
  }, [dismissKeyboard, editorRef, openTts]);

  const openTtsForAudio = useCallback(
    (element: SlateElement, path: Path, text: string) => {
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      openTts(editor, { kind: "replace", element, path, text });
    },
    [editorRef, openTts]
  );

  const closeTts = useCallback(() => {
    ttsTargetRef.current?.dispose();
    ttsTargetRef.current = null;
    setTtsTarget(null);
  }, []);

  const handleTtsInserted = useCallback(
    (kind: TtsInsertIntent["kind"]) => {
      closeTts();
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      if (editor.selection) lastSelectionRef.current = editor.selection;
      markSelectionDirty();
      toast({
        type: "success",
        text: kind === "replace" ? "已替换音频" : "已插入音频",
        action: { label: "撤销", onClick: () => undoRef.current() },
      });
    },
    [closeTts, editorRef, markSelectionDirty]
  );

  return {
    ttsTarget,
    openTts,
    openTtsForSelection,
    openTtsForAudio,
    closeTts,
    handleTtsInserted,
  };
}
