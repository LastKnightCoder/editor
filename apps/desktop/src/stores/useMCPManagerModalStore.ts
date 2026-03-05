import { create } from "zustand";

interface MCPManagerModalState {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const useMCPManagerModalStore = create<MCPManagerModalState>((set) => ({
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
}));

export default useMCPManagerModalStore;
