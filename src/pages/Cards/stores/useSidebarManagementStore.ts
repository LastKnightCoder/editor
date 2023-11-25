import { create } from 'zustand';

interface IState {
  isHideSidebar: boolean;
  sidebarWidth: number;
}

interface IActions {

}

const initialState: IState = {
  isHideSidebar: false,
  sidebarWidth: 300,
}

const useSidebarManagementStore = create<IState & IActions>((set, get) => ({
  ...initialState
}));

export default useSidebarManagementStore;