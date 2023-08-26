import { create } from "zustand";
import { produce } from "immer";

interface IState {
  darkMode: boolean;
  settingModalOpen: boolean;
  fontSetting: {
    chineseFont: string;
    englishFont: string;
    fontSize: number;
  }
}

interface IActions {
  setSettingModalOpen: (open: boolean) => void;
  onChineseFontChange: (font: string) => void;
  onEnglishFontChange: (font: string) => void;
  onFontSizeChange: (size: number) => void;
}

const initialState: IState = {
  darkMode: true,
  settingModalOpen: false,
  fontSetting: {
    chineseFont: '新宋体',
    englishFont: 'Merriweather',
    fontSize: 16,
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
  },
  onFontSizeChange: (size) => {
    const { fontSetting } = get();
    const newFontSetting = produce(fontSetting, (draft) => {
      draft.fontSize = size;
    });
    set({
      fontSetting: newFontSetting,
    });
  }
}));

export default useSettingStore;
