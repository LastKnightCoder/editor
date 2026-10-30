import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Editor, type RangeRef } from "slate";
import { ReactEditor } from "slate-react";
import {
  resolvePanelHeight,
  useKeyboardReservation,
  useKeyboardViewport,
} from "../../components/KeyboardViewportProvider";
import { hideKeyboard, showKeyboard } from "../cards/editorToolbar/keyboardSwap";

type KeyboardSwap = {
  editor: Editor;
  selection: RangeRef | null;
  restoreFocus: boolean;
};

/** 用等高语音面板替换键盘，保留正文可见区和原编辑焦点。 */
export function useDictationKeyboardSwap(onChange?: (active: boolean) => void) {
  const viewport = useKeyboardViewport();
  const reservation = useKeyboardReservation();
  const [panelHeight, setPanelHeight] = useState(() => resolvePanelHeight(viewport));
  const swapRef = useRef<KeyboardSwap | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const begin = useCallback(
    (editor: Editor) => {
      if (swapRef.current) return;
      const restoreFocus = ReactEditor.isFocused(editor as ReactEditor);
      swapRef.current = {
        editor,
        selection: editor.selection ? Editor.rangeRef(editor, editor.selection) : null,
        restoreFocus,
      };
      const height = viewport.rawKeyboardHeight || resolvePanelHeight(viewport);
      // 先让预留和入口保活生效，避免失焦收键盘时正文跳动或手势被卸载。
      flushSync(() => {
        reservation.reserve(height);
        setPanelHeight(height);
        onChangeRef.current?.(true);
      });
      if (restoreFocus) hideKeyboard(editor, "blur", null);
    },
    [reservation, viewport]
  );

  const restore = useCallback(() => {
    const swap = swapRef.current;
    if (!swap) return;
    swapRef.current = null;
    const selection = swap.selection?.unref() ?? null;
    try {
      if (swap.restoreFocus && document.visibilityState !== "hidden") {
        showKeyboard(swap.editor, "blur", null, selection);
        reservation.releaseWhenKeyboardShown();
      } else {
        reservation.releaseNow();
      }
    } catch {
      reservation.releaseNow();
    } finally {
      onChangeRef.current?.(false);
    }
  }, [reservation]);

  useEffect(
    () => () => {
      const swap = swapRef.current;
      if (!swap) return;
      swapRef.current = null;
      swap.selection?.unref();
      reservation.releaseNow();
      onChangeRef.current?.(false);
    },
    [reservation]
  );

  return { panelHeight, begin, restore };
}
