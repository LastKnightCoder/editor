// 主导航 4 个 Tab 根的视觉映射与激活态：底部 Dock 与左侧导航条共用。
// 顺序契约（TAB_ORDER）在 router/tabs.ts，供滑动手势共用。

import { useMemo } from "react";
import { House, Layers, NotebookPen, User } from "lucide-react";
import { TAB_ORDER, isTabRoot, useRouterContext, useTabSwipeOrigin, type TabKey } from "../router";

const TAB_VISUALS: Record<TabKey, { label: string; icon: typeof House }> = {
  home: { label: "今天", icon: House },
  cardsLibrary: { label: "卡片", icon: Layers },
  diaryHome: { label: "日记", icon: NotebookPen },
  settings: { label: "我的", icon: User },
};

export const NAV_TABS = TAB_ORDER.map(key => ({ key, ...TAB_VISUALS[key] }));

export type NavTab = (typeof NAV_TABS)[number];

/**
 * 激活 Tab = 栈内最靠近顶部的 Tab 根（二级页归属其入口 Tab），兜底今天；
 * 滑动手势期间以 origin 为准：push 预推入会提前改栈，但高亮只应在页面
 * 滑完落定后跟随，避免「tab 先动页面后动」、取消时高亮来回跳
 */
export function useActiveTab(): string {
  const { state } = useRouterContext();
  const entries = state.screens.entries;
  const stackActiveTab = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (isTabRoot(entries[i].key)) return entries[i].key;
    }
    return "home";
  }, [entries]);
  return useTabSwipeOrigin() ?? stackActiveTab;
}
