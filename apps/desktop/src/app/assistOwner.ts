/**
 * 页面接管 AI 对话开关（D-070）：页面自带这份内容专属的对话栏时（如 PDF 阅读页），
 * 在栈顶期间注册开关——Ctrl/⌘+J、命令面板「AI 对话」改为开合页面自己的对话栏，
 * 标题栏的停靠栏按钮与壳层停靠栏在该页隐藏（同一位置不出现两份对话）。
 * 保活隐藏的页面 effect 已清理，注册随之撤销，不会抢到别的页面。
 */

import { useEffect, useRef } from "react";
import { create } from "zustand";

interface AssistOwnerState {
  /** page key → 页面的对话开关 */
  owners: Record<string, () => void>;
}

export const useAssistOwnerStore = create<AssistOwnerState>(() => ({ owners: {} }));

export function useOwnAssist(pageKey: string, toggle: () => void, active = true) {
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    if (!active) return;
    const handler = () => toggleRef.current();
    useAssistOwnerStore.setState(s => ({ owners: { ...s.owners, [pageKey]: handler } }));
    return () =>
      useAssistOwnerStore.setState(s => {
        if (s.owners[pageKey] !== handler) return s;
        const owners = { ...s.owners };
        delete owners[pageKey];
        return { owners };
      });
  }, [pageKey, active]);
}

/** 栈顶页面是否接管了对话开关 */
export function useAssistOwned(pageKey: string | undefined): boolean {
  return useAssistOwnerStore(s => (pageKey ? pageKey in s.owners : false));
}

/** 开合 AI 对话：栈顶页面接管了就交给它，否则开合壳层停靠栏 */
export function toggleAssistFor(pageKey: string | undefined, toggleDock: () => void) {
  const owner = pageKey ? useAssistOwnerStore.getState().owners[pageKey] : undefined;
  if (owner) owner();
  else toggleDock();
}
