import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EditorWindowKind } from "@tau/platform";

/** 编辑窗口偏好（按内容类型记忆大纲开关；打字机滚动全局一份） */
interface EditorWindowPrefs {
  outline: Record<EditorWindowKind, boolean>;
  typewriter: boolean;
  toggleOutline(kind: EditorWindowKind): void;
  toggleTypewriter(): void;
}

export const useEditorWindowPrefs = create<EditorWindowPrefs>()(
  persist(
    set => ({
      // 卡片通常很短，大纲默认关
      outline: { card: false, article: true, "project-item": true },
      typewriter: false,
      toggleOutline: kind =>
        set(state => ({ outline: { ...state.outline, [kind]: !state.outline[kind] } })),
      toggleTypewriter: () => set(state => ({ typewriter: !state.typewriter })),
    }),
    { name: "tau-editor-window-prefs" }
  )
);
