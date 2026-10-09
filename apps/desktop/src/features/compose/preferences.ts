/** 创作模式本机偏好：正文栏宽度（全局，不按文章记） */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EDITOR_PANE_DEFAULT = 640;
export const EDITOR_PANE_MIN = 480;
/** 白板至少留这么宽，否则退回只看正文 */
export const BOARD_PANE_MIN = 360;

interface ComposePreferencesState {
  editorWidth: number;
  setEditorWidth(width: number): void;
}

export const useComposePreferences = create<ComposePreferencesState>()(
  persist(
    set => ({
      editorWidth: EDITOR_PANE_DEFAULT,
      setEditorWidth: editorWidth => set({ editorWidth }),
    }),
    { name: "tau-compose-preferences", partialize: ({ editorWidth }) => ({ editorWidth }) }
  )
);
