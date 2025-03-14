import { create } from "zustand";

interface IState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  focusMode: boolean;
  listWidth: number;
  listOpen: boolean;
  rightSidebarOpen: boolean;
  databaseStatus: Record<string, boolean>;
}

const sidebarWidth = Number(localStorage.getItem("sidebarWidth")) || 300;
const listWidth = Number(localStorage.getItem("listWidth")) || 300;

export const useGlobalStateStore = create<IState>(() => ({
  sidebarOpen: true,
  sidebarWidth,
  listOpen: true,
  listWidth,
  focusMode: false,
  rightSidebarOpen: false,
  databaseStatus: {},
}));

export default useGlobalStateStore;
