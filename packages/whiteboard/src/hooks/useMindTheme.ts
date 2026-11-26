import { useStore } from "zustand";
import { useBoard } from "./useBoard";
import type { MindThemePreviewState } from "../utils/MindThemePreviewStore";
import { useThemeStore } from "@tau/themes/react";

import type { MindNodeElement } from "../types";
import MindThemeUtil, { type MindMode } from "../utils/MindThemeUtil";
import { getMindLayout } from "../utils/mind-layout";

export function useMindThemePreviewStore<T>(selector: (state: MindThemePreviewState) => T): T {
  return useStore(useBoard().mindThemePreviewStore, selector);
}

/** 应用当前明暗 */
export function useMindMode(): MindMode {
  return useThemeStore(s => s.mode) === "dark" ? "dark" : "light";
}

/** 根节点生效的主题（悬停预览优先） */
export function useMindTheme(root: Pick<MindNodeElement, "id" | "themeId" | "themeStyle"> | null) {
  const preview = useMindThemePreviewStore(s => (root ? s.previews[root.id] : undefined));
  return MindThemeUtil.getThemeOf(preview ?? root);
}

/** 根节点生效的布局与预览坐标（悬停布局卡片时） */
export function useMindLayout(root: Pick<MindNodeElement, "id" | "layout"> | null) {
  const preview = useMindThemePreviewStore(s => (root ? s.layouts[root.id] : undefined));
  return {
    layout: getMindLayout(preview ? { layout: preview.layout } : root),
    previewNodes: preview?.nodes,
  };
}
