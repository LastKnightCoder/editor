import { create } from "zustand";
import { ReactNode } from "react";

interface SideBarAction {
  icon: ReactNode;
  title: string;
  onClick: () => void;
}

interface IState {
  settingModalOpen: boolean;
  fontSetting: {
    chineseFont: string;
    englishFont: string;
  },
  rightSideBar: {
    top: SideBarAction[],
    bottom: SideBarAction[]
  }
}

interface IActions {
  setSettingModalOpen: (open: boolean) => void;
}

const initialState: IState = {
  settingModalOpen: false,
  fontSetting: {
    chineseFont: '新宋体',
    englishFont: 'Merriweather',
  },
  rightSideBar: {
    top: [],
    bottom: []
  }
}

const useSettingStore = create<IState & IActions>((set) => ({
  ...initialState,
  setSettingModalOpen: (open) => {
    set({
      settingModalOpen: open,
    });
  }
}));

export default useSettingStore;
