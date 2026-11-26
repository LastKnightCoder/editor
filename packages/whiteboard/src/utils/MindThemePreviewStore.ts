import { createStore } from "zustand/vanilla";
import type { MindNodeElement } from "../types/mind";
import type { MindLayoutId } from "./mind-layout";

/** 悬停布局卡片时的预览：只改渲染位置，不写文档 */
export interface MindLayoutPreview {
  layout: MindLayoutId;
  nodes: ReadonlyMap<string, MindNodeElement>;
}

export interface MindThemePreviewState {
  previews: Record<string, { themeId: string; themeStyle: string }>;
  layouts: Record<string, MindLayoutPreview>;
  setPreview(rootId: string, theme: { themeId: string; themeStyle: string } | null): void;
  setLayoutPreview(rootId: string, preview: MindLayoutPreview | null): void;
}

const withEntry = <T>(record: Record<string, T>, key: string, value: T | null) => {
  const next = { ...record };
  if (value) next[key] = value;
  else delete next[key];
  return next;
};

export const createMindThemePreviewStore = () =>
  createStore<MindThemePreviewState>(set => ({
    previews: {},
    layouts: {},
    setPreview: (rootId, theme) =>
      set(state => ({ previews: withEntry(state.previews, rootId, theme) })),
    setLayoutPreview: (rootId, preview) =>
      set(state => ({ layouts: withEntry(state.layouts, rootId, preview) })),
  }));
