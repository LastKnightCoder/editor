import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 每个父会话当前打开详情的子 Agent：任务卡、顶部入口与详情容器共用 */
interface FocusState {
  opened: Record<string, string | null>;
}

export const useSubagentFocusStore = create<FocusState>(() => ({ opened: {} }));

export const openSubagentDetail = (parentScope: string, agentId: string | null) =>
  useSubagentFocusStore.setState(state => ({
    opened: { ...state.opened, [parentScope]: agentId },
  }));

export const useOpenedSubagent = (parentScope: string) =>
  useSubagentFocusStore(state => state.opened[parentScope] ?? null);

/** 对话页详情抽屉的宽度：拖拽调整后跨会话、跨重启保留 */
export const SUBAGENT_DRAWER_DEFAULT_W = 440;
export const SUBAGENT_DRAWER_MIN_W = 360;

export const useSubagentDrawerWidth = create<{
  width: number;
  setWidth: (width: number) => void;
}>()(
  persist(
    set => ({
      width: SUBAGENT_DRAWER_DEFAULT_W,
      setWidth: width => set({ width: Math.round(width) }),
    }),
    { name: "subagent-drawer-width" }
  )
);

/** 有执行中任务时每秒刷新一次，用于耗时显示 */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
