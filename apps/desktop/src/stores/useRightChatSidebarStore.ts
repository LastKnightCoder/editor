import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IRightChatSidebarState {
  activePanel: "chat" | "components" | null;
  width: number;
  componentsWidth: number;
  currentChatId: number | null;
}

interface IRightChatSidebarActions {
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  toggleComponentsOpen: () => void;
  setComponentsOpen: (open: boolean) => void;
  setActivePanel: (panel: "chat" | "components" | null) => void;
  setWidth: (width: number) => void;
  setComponentsWidth: (width: number) => void;
  setCurrentChatId: (chatId: number | null) => void;
}

const useRightChatSidebarStore = create<
  IRightChatSidebarState & IRightChatSidebarActions
>()(
  persist(
    (set) => ({
      activePanel: null,
      width: 400,
      componentsWidth: 380,
      currentChatId: null,

      toggleOpen: () =>
        set((state) => ({
          activePanel: state.activePanel === "chat" ? null : "chat",
        })),
      setOpen: (open) => set({ activePanel: open ? "chat" : null }),
      toggleComponentsOpen: () =>
        set((state) => ({
          activePanel: state.activePanel === "components" ? null : "components",
        })),
      setComponentsOpen: (open) =>
        set({ activePanel: open ? "components" : null }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setWidth: (width) => set({ width }),
      setComponentsWidth: (width) => set({ componentsWidth: width }),
      setCurrentChatId: (chatId) => set({ currentChatId: chatId }),
    }),
    {
      name: "right-chat-sidebar",
      partialize: (state) => ({
        activePanel: state.activePanel,
        width: state.width,
        componentsWidth: state.componentsWidth,
        currentChatId: state.currentChatId,
      }),
      migrate: (persistedState: unknown) => {
        const state = persistedState as Partial<
          IRightChatSidebarState & { open?: boolean }
        >;
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
    },
  ),
);

export default useRightChatSidebarStore;
