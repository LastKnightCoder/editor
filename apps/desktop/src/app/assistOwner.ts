/**
 * 页面接管 AI 对话开关：页面自带这份内容专属的对话栏时（如 PDF 阅读页），
 * 在栈顶期间注册开关——Ctrl/⌘+J、命令面板「AI 对话」改为开合页面自己的对话栏，
 * 标题栏的停靠栏按钮与壳层停靠栏在该页隐藏（同一位置不出现两份对话）。
 * 保活隐藏的页面 effect 已清理，注册随之撤销，不会抢到别的页面。
 */

import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";
import { useShellStore } from "./shellStore";

interface AssistOwner {
  isChatOpen(): boolean;
  toggle(): void;
}

interface AssistOwnerState {
  /** page key → 页面的对话开关 */
  owners: Record<string, AssistOwner & { instance: symbol }>;
}

export const useAssistOwnerStore = create<AssistOwnerState>(() => ({
  owners: {},
}));

export function useOwnAssist(pageKey: string, owner: AssistOwner, active = true) {
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  useEffect(() => {
    if (!active) return;
    const handler = {
      instance: Symbol(pageKey),
      isChatOpen: () => ownerRef.current.isChatOpen(),
      toggle: () => ownerRef.current.toggle(),
    };
    useAssistOwnerStore.setState(s => ({
      owners: { ...s.owners, [pageKey]: handler },
    }));
    return () =>
      useAssistOwnerStore.setState(s => {
        if (s.owners[pageKey] !== handler) return s;
        const owners = { ...s.owners };
        delete owners[pageKey];
        return { owners };
      });
  }, [pageKey, active]);
}

/** 网页临时占用右栏时保留本页的对话偏好；显式打开对话时收回网页。 */
export function usePageChatPanel(preferredOpen: boolean, setPreference: (open: boolean) => void) {
  const occupied = useShellStore(s => s.assistView !== null && s.assistView !== "chat");
  const setOpen = useCallback(
    (open: boolean) => {
      if (open) {
        const shell = useShellStore.getState();
        if (shell.pluginDock) shell.hideAssist();
        else shell.closeAssist("web");
      }
      setPreference(open);
    },
    [setPreference]
  );
  return [preferredOpen && !occupied, setOpen] as const;
}

/** 栈顶页面是否接管了对话开关 */
export function useAssistOwned(pageKey: string | undefined): boolean {
  return useAssistOwnerStore(s => (pageKey ? pageKey in s.owners : false));
}

/** 开合 AI 对话：栈顶页面接管了就交给它，否则开合壳层停靠栏 */
export function toggleAssistFor(pageKey: string | undefined, toggleDock: () => void) {
  const owner = pageKey ? useAssistOwnerStore.getState().owners[pageKey] : undefined;
  if (owner) owner.toggle();
  else toggleDock();
}
