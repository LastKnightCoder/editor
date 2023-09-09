import { create } from "zustand";
import { produce } from "immer";

import { getSetting } from '@/commands';

interface ISetting {
  fontSetting: {
    chineseFont: string;
    englishFont: string;
    fontSize: number;
  },
  darkMode: boolean;
}

interface IState {
  setting: ISetting;
  settingModalOpen: boolean;
}

interface IActions {
  initSetting: () => void;
  setSettingModalOpen: (open: boolean) => void;
  onFontSettingChange: (fontSetting: ISetting['fontSetting']) => void;
  onDarkModeChange: (darkMode: boolean) => void;
}

const initialState: IState = {
  setting: {
    darkMode: true,
    fontSetting: {
      chineseFont: '新宋体',
      englishFont: 'Merriweather',
      fontSize: 16,
    }
  },
  settingModalOpen: false,
}

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async () => {
    const setting = await getSetting();
    if (setting) {
      set({
        setting: JSON.parse(setting),
      });
    }
  },
  setSettingModalOpen: (open) => {
    set({
      settingModalOpen: open,
    });
  },
  onFontSettingChange: (fontSetting) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.fontSetting = fontSetting;
      })
    });
  },
  onDarkModeChange: (darkMode) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.darkMode = darkMode;
      })
    });
  }
}));

export default useSettingStore;
