import { create } from 'zustand';

interface IState {
  sidebarOpen: boolean;
  sidebarWidth: number;
}

const sidebarWidth = Number(localStorage.getItem('sidebarWidth')) || 300;

export const useGlobalStateStore = create<IState>(() => ({
  sidebarOpen: true,
  sidebarWidth,
}));

export default useGlobalStateStore;