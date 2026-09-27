import { create } from "zustand";
import { useThemeStore } from "@tau/ui/theme/runtime";

import type { MindNodeElement } from "../types";
import MindThemeUtil, { type MindMode } from "../utils/MindThemeUtil";

interface MindThemePreviewState {
  /** 主题面板悬停时的临时主题：rootId → 主题；只影响渲染，不写入文档 */
  previews: Record<string, { themeId: string; themeStyle: string }>;
  setPreview(rootId: string, theme: { themeId: string; themeStyle: string } | null): void;
}

export const useMindThemePreviewStore = create<MindThemePreviewState>(set => ({
  previews: {},
  setPreview: (rootId, theme) =>
    set(state => {
      const previews = { ...state.previews };
      if (theme) previews[rootId] = theme;
      else delete previews[rootId];
      return { previews };
    }),
}));

/** 应用当前明暗 */
export function useMindMode(): MindMode {
  return useThemeStore(s => s.mode) === "dark" ? "dark" : "light";
}

/** 根节点生效的主题（悬停预览优先） */
export function useMindTheme(root: Pick<MindNodeElement, "id" | "themeId" | "themeStyle"> | null) {
  const preview = useMindThemePreviewStore(s => (root ? s.previews[root.id] : undefined));
  return MindThemeUtil.getThemeOf(preview ?? root);
}
