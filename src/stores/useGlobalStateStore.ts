import { create } from 'zustand';

interface IState {
  sidebarOpen: boolean;
}

export const useGlobalStateStore = create<IState>(() => ({
  sidebarOpen: true,
}));

export default useGlobalStateStore;