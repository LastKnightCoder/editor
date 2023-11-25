import { create } from 'zustand';

interface IState {
  isHideSidebar: boolean;
  sidebarWidth: number;
}

const initialState: IState = {
  isHideSidebar: false,
  sidebarWidth: 300,
}

const useSidebarManagementStore = create<IState>(() => ({
  ...initialState
}));

export default useSidebarManagementStore;