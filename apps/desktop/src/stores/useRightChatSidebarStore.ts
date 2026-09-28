import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IRightChatSidebarState {
  activePanel: "chat" | "components" | null;
  width: number;
  componentsWidth: number;
  /** 停靠栏当前对话（pi 会话 id）；旧版本持久化的 number 读出时丢弃 */
  currentChatId: string | null;
}

interface IRightChatSidebarActions {
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  toggleComponentsOpen: () => void;
  setComponentsOpen: (open: boolean) => void;
  setActivePanel: (panel: "chat" | "components" | null) => void;
  setWidth: (width: number) => void;
  setComponentsWidth: (width: number) => void;
  setCurrentChatId: (chatId: string | null) => void;
}

const useRightChatSidebarStore = create<IRightChatSidebarState & IRightChatSidebarActions>()(
  persist(
    set => ({
      activePanel: null,
      width: 400,
      componentsWidth: 380,
      currentChatId: null,

      toggleOpen: () =>
        set(state => ({
          activePanel: state.activePanel === "chat" ? null : "chat",
        })),
      setOpen: open => set({ activePanel: open ? "chat" : null }),
      toggleComponentsOpen: () =>
        set(state => ({
          activePanel: state.activePanel === "components" ? null : "components",
        })),
      setComponentsOpen: open => set({ activePanel: open ? "components" : null }),
      setActivePanel: panel => set({ activePanel: panel }),
      setWidth: width => set({ width }),
      setComponentsWidth: width => set({ componentsWidth: width }),
      setCurrentChatId: chatId => set({ currentChatId: chatId }),
    }),
    {
      name: "right-chat-sidebar",
      partialize: state => ({
        activePanel: state.activePanel,
        width: state.width,
        componentsWidth: state.componentsWidth,
        currentChatId: state.currentChatId,
      }),
      migrate: (persistedState: unknown) => {
        const state = persistedState as Partial<IRightChatSidebarState & { open?: boolean }>;
        if (state.activePanel === undefined && state.open !== undefined) {
          return {
            ...state,
            activePanel: state.open ? "chat" : null,
            componentsWidth: state.componentsWidth ?? 380,
          };
        }
        return {
          ...state,
          componentsWidth: state.componentsWidth ?? 380,
        };
      },
      // 每次读出都校验（migrate 只在版本号变化时跑）：M4 前存的是自增 number id，已无对应会话
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<IRightChatSidebarState>;
        return {
          ...current,
          ...state,
          currentChatId: typeof state.currentChatId === "string" ? state.currentChatId : null,
        };
      },
    }
  )
);

export default useRightChatSidebarStore;
