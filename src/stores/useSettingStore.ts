import { create } from "zustand";
import { produce } from "immer";
import { merge, cloneDeep } from 'lodash';

import { getSetting } from '@/commands';

export enum EImageBed {
  Github = 'github',
  AliOSS = 'aliOSS',
}

interface ISetting {
  fontSetting: {
    chineseFont: string;
    englishFont: string;
    fontSize: number;
  },
  imageBed: {
    active: EImageBed;
    github: {
      token: string;
      repo: string;
      branch: string;
      user: {
        name: string;
        email: string;
      }
    },
    aliOSS: {
      accessKeyId: string;
      accessKeySecret: string;
      bucket: string;
      region: string;
    }
  },
  darkMode: boolean;
}

interface IState {
  inited: boolean;
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
  inited: false,
  setting: {
    darkMode: false,
    fontSetting: {
      chineseFont: '华文楷体',
      englishFont: 'American TypeWriter',
      fontSize: 16,
    },
    imageBed: {
      active: EImageBed.Github,
      github: {
        token: '',
        repo: '',
        branch: '',
        user: {
          name: '',
          email: '',
        }
      },
      aliOSS: {
        accessKeyId: '',
        accessKeySecret: '',
        bucket: '',
        region: '',
      }
    }
  },
  settingModalOpen: false,
}

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async () => {
    const setting = await getSetting();
    try {
      const parsedSetting = JSON.parse(setting);
      const newSetting = cloneDeep(initialState.setting);
      merge(newSetting, parsedSetting);
      console.log('newSetting', newSetting);
      set({
        setting: newSetting,
      })
    } finally {
      set({
        inited: true,
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
