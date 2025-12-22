import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IRightChatSidebarState {
  open: boolean;
  width: number;
  currentChatId: number | null;
}

interface IRightChatSidebarActions {
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setCurrentChatId: (chatId: number | null) => void;
}

const useRightChatSidebarStore = create<
  IRightChatSidebarState & IRightChatSidebarActions
>()(
  persist(
    (set) => ({
      open: false,
      width: 400,
      currentChatId: null,

      toggleOpen: () => set((state) => ({ open: !state.open })),
      setOpen: (open) => set({ open }),
      setWidth: (width) => set({ width }),
      setCurrentChatId: (chatId) => set({ currentChatId: chatId }),
    }),
    {
      name: "right-chat-sidebar",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
        currentChatId: state.currentChatId,
      }),
    },
  ),
);

export default useRightChatSidebarStore;
