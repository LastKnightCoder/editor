import { create } from 'zustand';

interface IState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  focusMode: boolean;
}

const sidebarWidth = Number(localStorage.getItem('sidebarWidth')) || 300;

export const useGlobalStateStore = create<IState>(() => ({
  sidebarOpen: true,
  sidebarWidth,
  focusMode: false,
}));

export default useGlobalStateStore;