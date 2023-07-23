import { create } from "zustand";

interface IState {
  settingModalOpen: boolean;
  fontSetting: {
    chineseFont: string;
    englishFont: string;
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
