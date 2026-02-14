import { create } from "zustand";

export type DatabaseConnectionStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "ready"
  | "error";

interface IState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  focusMode: boolean;
  listWidth: number;
  listOpen: boolean;
  databaseStatus: Record<string, DatabaseConnectionStatus>;
}

const sidebarWidth = Number(localStorage.getItem("sidebarWidth")) || 300;
const listWidth = Number(localStorage.getItem("listWidth")) || 300;

export const useGlobalStateStore = create<IState>(() => ({
  sidebarOpen: true,
  sidebarWidth,
  listOpen: true,
  listWidth,
  focusMode: false,
  databaseStatus: {},
}));

export default useGlobalStateStore;
