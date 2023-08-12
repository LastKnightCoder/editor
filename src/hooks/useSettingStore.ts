import { create } from "zustand";
import { ReactNode } from "react";
import { produce } from "immer";

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
  onChineseFontChange: (font: string) => void;
  onEnglishFontChange: (font: string) => void;
}

const initFontSetting = JSON.parse(localStorage.getItem('fontSetting') || 'null');

const initialState: IState = {
  settingModalOpen: false,
  fontSetting: initFontSetting ||  {
    chineseFont: '新宋体',
    englishFont: 'Merriweather',
  },
  rightSideBar: {
    top: [],
    bottom: []
  }
}

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  setSettingModalOpen: (open) => {
    set({
      settingModalOpen: open,
    });
  },
  onChineseFontChange: (font) => {
    const { fontSetting } = get();
    console.log('font', font);
    const newFontSetting = produce(fontSetting, (draft) => {
      draft.chineseFont = font;
    });
    set({
      fontSetting: newFontSetting,
    });
  },
  onEnglishFontChange: (font) => {
    const { fontSetting } = get();
    const newFontSetting = produce(fontSetting, (draft) => {
      draft.englishFont = font;
    });
    set({
      fontSetting: newFontSetting,
    });
  }
}));

export default useSettingStore;
