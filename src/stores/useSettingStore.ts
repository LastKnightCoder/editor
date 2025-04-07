import { create } from "zustand";
import { produce } from "immer";
import { merge, cloneDeep } from "lodash";

import { getSetting } from "@/commands";
import { EGithubCDN } from "@/constants/github";

export enum EImageBed {
  Local = "local",
  Github = "github",
  AliOSS = "aliOSS",
}

export enum ESync {
  AliOSS = "aliOSS",
}

export enum ELLMProvider {
  OPENAI = "openai",
  OTHER = "other",
}

interface DoubaoVoiceCopyConfig {
  accessToken: string;
  secretKey: string;
  appid: string;
  token: string;
  currentSpeakerId: string;
}

export interface ISetting {
  fontSetting: {
    chineseFont: string;
    englishFont: string;
    fontSize: number;
    codeFont: string;
  };
  imageBed: {
    active: EImageBed;
    github: {
      token: string;
      repo: string;
      branch: string;
      user: {
        name: string;
        email: string;
      };
      cdn: EGithubCDN | null;
    };
    aliOSS: {
      accessKeyId: string;
      accessKeySecret: string;
      bucket: string;
      region: string;
    };
    local: {
      path: string;
    };
  };
  sync: {
    active: ESync;
    version: number;
    aliOSS: {
      accessKeyId: string;
      accessKeySecret: string;
      bucket: string;
      region: string;
      path: string;
    };
  };
  database: {
    active: string;
    databases: Array<{
      name: string;
      version: number;
    }>;
  };
  module: {
    card: {
      enable: boolean;
      name: "卡片";
    };
    article: {
      enable: boolean;
      name: "文章";
    };
    whiteBoard: {
      enable: boolean;
      name: "白板";
    };
    project: {
      enable: boolean;
      name: "项目";
    };
    document: {
      enable: boolean;
      name: "知识库";
    };
    dailyNote: {
      enable: boolean;
      name: "日记";
    };
    pdf: {
      enable: boolean;
      name: "PDF";
    };
    timeRecord: {
      enable: boolean;
      name: "时间记录";
    };
    vecDocuments: {
      enable: boolean;
      name: "索引数据库";
    };
  };
  darkMode: boolean;
  textToSpeech: {
    currentModel: string;
    doubao: DoubaoVoiceCopyConfig;
  };
  llmProviders: {
    currentProvider: ELLMProvider;
    [ELLMProvider.OPENAI]: {
      currentConfigId: string;
      configs: Array<{
        id: string;
        name: string;
        apiKey: string;
        baseUrl: string;
        currentModel: string;
        models: Array<{
          name: string;
          description: string;
          features: {
            online: boolean;
            thinking: boolean;
            multimodal: boolean;
          };
        }>;
      }>;
    };
    [ELLMProvider.OTHER]: {
      currentConfigId: string;
      configs: Array<{
        id: string;
        name: string;
        apiKey: string;
        baseUrl: string;
        currentModel: string;
        models: Array<{
          name: string;
          description: string;
          features: {
            online: boolean;
            thinking: boolean;
            multimodal: boolean;
          };
        }>;
      }>;
    };
  };
  embeddingProvider: {
    currentConfigId: string;
    configs: Array<{
      id: string;
      name: string;
      apiKey: string;
      baseUrl: string;
      currentModel: string;
      models: Array<{
        name: string;
        description: string;
        contextLength: number;
        features: {
          multimodal: boolean;
        };
        distance: number;
      }>;
    }>;
  };
}

interface IState {
  inited: boolean;
  setting: ISetting;
  settingModalOpen: boolean;
}

interface IActions {
  initSetting: () => void;
  setSettingModalOpen: (open: boolean) => void;
  onFontSettingChange: (fontSetting: ISetting["fontSetting"]) => void;
  onDarkModeChange: (darkMode: boolean) => void;
}

const initialState: IState = {
  inited: false,
  setting: {
    darkMode: false,
    fontSetting: {
      chineseFont: "华文楷体",
      englishFont: "American TypeWriter",
      codeFont: "JetBrains Mono",
      fontSize: 16,
    },
    imageBed: {
      active: EImageBed.Github,
      github: {
        token: "",
        repo: "",
        branch: "",
        user: {
          name: "",
          email: "",
        },
        cdn: null,
      },
      aliOSS: {
        accessKeyId: "",
        accessKeySecret: "",
        bucket: "",
        region: "",
      },
      local: {
        path: "resources",
      },
    },
    sync: {
      active: ESync.AliOSS,
      version: 1,
      aliOSS: {
        accessKeyId: "",
        accessKeySecret: "",
        bucket: "",
        region: "",
        path: "/",
      },
    },
    database: {
      active: "data.db",
      databases: [
        {
          name: "data.db",
          version: 1,
        },
      ],
    },
    module: {
      card: {
        enable: true,
        name: "卡片",
      },
      article: {
        enable: true,
        name: "文章",
      },
      whiteBoard: {
        enable: true,
        name: "白板",
      },
      project: {
        enable: true,
        name: "项目",
      },
      document: {
        enable: true,
        name: "知识库",
      },
      dailyNote: {
        enable: true,
        name: "日记",
      },
      pdf: {
        enable: true,
        name: "PDF",
      },
      timeRecord: {
        enable: true,
        name: "时间记录",
      },
      vecDocuments: {
        enable: true,
        name: "索引数据库",
      },
    },
    textToSpeech: {
      currentModel: "doubao",
      doubao: {
        accessToken: "",
        secretKey: "",
        appid: "",
        token: "",
        currentSpeakerId: "",
      },
    },
    llmProviders: {
      currentProvider: ELLMProvider.OPENAI,
      [ELLMProvider.OPENAI]: {
        currentConfigId: "",
        configs: [],
      },
      [ELLMProvider.OTHER]: {
        currentConfigId: "",
        configs: [],
      },
    },
    embeddingProvider: {
      currentConfigId: "",
      configs: [],
    },
  },
  settingModalOpen: false,
};

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async () => {
    const setting = await getSetting();
    try {
      const parsedSetting = JSON.parse(setting);
      const newSetting = cloneDeep(initialState.setting);
      merge(newSetting, parsedSetting);
      set({
        setting: newSetting,
      });
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
      }),
    });
  },
  onDarkModeChange: (darkMode) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.darkMode = darkMode;
      }),
    });
  },
}));

export default useSettingStore;
