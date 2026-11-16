import { useCallback, useEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { EditorRef } from "@tau/editor";
import { Transforms, type BaseSelection } from "slate";
import { ReactEditor } from "slate-react";

import type { KeyboardReservation } from "../../../components/KeyboardViewportProvider";
import { restoreSelectionAndFocus } from "./toolbarActions";
import {
  DEFAULT_KEYBOARD_SWAP_STRATEGY,
  clearKeyboardSwap,
  hideKeyboard,
  showKeyboard,
} from "./keyboardSwap";
import { getEditorFromRef } from "./useToolbarSelectionState";
import type { ClosePanelOptions, EditorPanelKind } from "./useMobileEditorToolbarController";

type ToolbarPanelsOptions = {
  editorRef: RefObject<EditorRef | null>;
  reservation: KeyboardReservation;
  getEditableElement: () => HTMLElement | null | undefined;
  markSelectionDirty: () => void;
  /** 与 useToolbarSelectionState 共享的同一 ref 实例，此处同步面板开关 */
  activePanelRef: RefObject<EditorPanelKind | null>;
  panelSelectionRef: RefObject<BaseSelection | null>;
  rememberPanelSelection: (selection: BaseSelection | null) => void;
  lastSelectionRef: RefObject<BaseSelection | null>;
};

/** 面板开合域：键盘/面板位置交换、键盘预留释放与面板选区保存 */
export function useToolbarPanels({
  editorRef,
  reservation,
  getEditableElement,
  markSelectionDirty,
  activePanelRef,
  panelSelectionRef,
  rememberPanelSelection,
  lastSelectionRef,
}: ToolbarPanelsOptions) {
  const [activePanel, setActivePanel] = useState<EditorPanelKind | null>(null);

  const openPanel = useCallback(
    (kind: EditorPanelKind, panelHeight: number) => {
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      if (activePanelRef.current) {
        const editable = getEditableElement();
        if (kind === "voice") editable?.setAttribute("inputmode", "none");
        else if (activePanelRef.current === "voice") {
          // 离开语音面板前先失焦，去掉 inputmode 后不会唤起键盘顶掉新面板
          if (ReactEditor.isFocused(editor as ReactEditor)) ReactEditor.blur(editor as ReactEditor);
          clearKeyboardSwap(editable);
        }
        activePanelRef.current = kind;
        setActivePanel(kind);
        return;
      }
      rememberPanelSelection(editor.selection ?? lastSelectionRef.current);
      activePanelRef.current = kind;
      // 预留与面板同一帧生效，键盘收起时正文可视区不跳动
      flushSync(() => {
        reservation.reserve(panelHeight);
        setActivePanel(kind);
      });
      if (kind !== "voice") {
        hideKeyboard(editor, DEFAULT_KEYBOARD_SWAP_STRATEGY, getEditableElement());
        return;
      }
      // 语音面板：失焦收键盘后以 inputmode=none 重新聚焦，保留系统光标，点正文只移动插入点不唤起键盘
      const editable = getEditableElement();
      editable?.setAttribute("inputmode", "none");
      hideKeyboard(editor, DEFAULT_KEYBOARD_SWAP_STRATEGY, editable);
      const saved = panelSelectionRef.current;
      window.requestAnimationFrame(() => {
        if (activePanelRef.current !== "voice") return;
        restoreSelectionAndFocus(editor, saved);
      });
    },
    [editorRef, getEditableElement, rememberPanelSelection, reservation]
  );

  const closePanel = useCallback(
    (closeOptions: ClosePanelOptions) => {
      if (!activePanelRef.current) return;
      const wasVoice = activePanelRef.current === "voice";
      // 先置位，回键盘触发的编辑器 focus 不再走点正文路径
      activePanelRef.current = null;
      const editor = getEditorFromRef(editorRef);
      if (wasVoice) {
        clearKeyboardSwap(getEditableElement());
        // 语音面板期间编辑器可能以 inputmode=none 保持焦点，先失焦才能重新唤起键盘
        if (editor && closeOptions.showKeyboard && ReactEditor.isFocused(editor as ReactEditor))
          ReactEditor.blur(editor as ReactEditor);
      }
      if (editor && closeOptions.showKeyboard) {
        const saved = panelSelectionRef.current;
        if (closeOptions.restoreSelection && saved) {
          Transforms.select(editor, saved);
        }
        showKeyboard(editor, DEFAULT_KEYBOARD_SWAP_STRATEGY, getEditableElement(), saved, {
          restoreSelection: closeOptions.restoreSelection ?? false,
        });
      }
      setActivePanel(null);
      reservation.releaseWhenKeyboardShown();
      markSelectionDirty();
    },
    [editorRef, getEditableElement, markSelectionDirty, reservation]
  );

  const togglePanel = useCallback(
    (kind: EditorPanelKind, panelHeight: number) => {
      if (activePanelRef.current === kind) {
        closePanel({ showKeyboard: true, restoreSelection: true });
        return;
      }
      openPanel(kind, panelHeight);
    },
    [closePanel, openPanel]
  );

  const dismissKeyboard = useCallback(() => {
    activePanelRef.current = null;
    setActivePanel(null);
    reservation.releaseNow();
    clearKeyboardSwap(getEditableElement());
    const editor = getEditorFromRef(editorRef);
    if (editor && ReactEditor.isFocused(editor as ReactEditor)) {
      ReactEditor.blur(editor as ReactEditor);
    }
  }, [editorRef, getEditableElement, reservation]);

  // 宿主卸载时面板仍开着则释放预留，避免下一页底部留白
  useEffect(() => {
    return () => {
      if (activePanelRef.current) {
        activePanelRef.current = null;
        reservation.releaseNow();
      }
    };
  }, [reservation]);

  return {
    activePanel,
    openPanel,
    togglePanel,
    closePanel,
    dismissKeyboard,
  };
}
