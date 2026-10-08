import { createStore } from "zustand/vanilla";
export interface MindThemePreviewState {
  previews: Record<string, { themeId: string; themeStyle: string }>;
  setPreview(rootId: string, theme: { themeId: string; themeStyle: string } | null): void;
}
export const createMindThemePreviewStore = () =>
  createStore<MindThemePreviewState>(set => ({
    previews: {},
    setPreview: (rootId, theme) =>
      set(state => {
        const previews = { ...state.previews };
        if (theme) previews[rootId] = theme;
        else delete previews[rootId];
        return { previews };
      }),
  }));
