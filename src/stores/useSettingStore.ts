import { create } from "zustand";
import { produce } from "immer";
import { merge, cloneDeep } from "lodash";

import { EGithubCDN } from "@/constants/github";

export enum EImageBed {
  Local = "local",
  Github = "github",
  AliOSS = "aliOSS",
}

export enum ESync {
  AliOSS = "aliOSS",
}

import type { ProviderConfig, ModelConfig, LLMUsageConfig } from "@/types/llm";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";
import { DeepPartial } from "@/types";

interface DoubaoVoiceCopyConfig {
  accessToken: string;
  secretKey: string;
  appid: string;
  token: string;
  currentSpeakerId: string;
}

export type { ProviderConfig, ModelConfig, LLMUsageConfig };

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
    goal: {
      enable: boolean;
      name: "进度管理";
    };
  };
  darkMode: boolean;
  textToSpeech: {
    currentModel: string;
    doubao: DoubaoVoiceCopyConfig;
  };
  llmConfigs: ProviderConfig[];
  llmUsageSettings: {
    chat: LLMUsageConfig | null;
    titleSummary: LLMUsageConfig | null;
    aiContinueWrite: LLMUsageConfig | null;
    webClip: LLMUsageConfig | null;
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
  integration: {
    bilibili: {
      enabled: boolean;
      credentials: {
        SESSDATA: string;
        bfe_id?: string;
      };
      userInfo: {
        name: string;
        avatar: string;
        isLogin: boolean;
        vipStatus: number; // 0: 普通成员，1：大会员
      };
    };
    youtube: {
      enabled: boolean;
      proxy: string;
    };
    notion: {
      enabled: boolean;
      token: string;
      userInfo: {
        name: string;
        email: string;
        avatar: string;
        isConnected: boolean;
      };
    };
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
  updateLLMUsageSetting: (
    feature: keyof ISetting["llmUsageSettings"],
    config: LLMUsageConfig | null,
  ) => void;
  updateBilibiliCredentials: (
    credentials: ISetting["integration"]["bilibili"]["credentials"],
  ) => void;
  updateBilibiliUserInfo: (
    userInfo: ISetting["integration"]["bilibili"]["userInfo"],
  ) => void;
  setBilibiliEnabled: (enabled: boolean) => void;
  setYoutubeEnabled: (enabled: boolean) => void;
  updateYoutubeProxy: (proxy: string) => void;
  updateNotionToken: (token: string) => void;
  updateNotionUserInfo: (
    userInfo: ISetting["integration"]["notion"]["userInfo"],
  ) => void;
  setNotionEnabled: (enabled: boolean) => void;
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
      goal: {
        enable: true,
        name: "进度管理",
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
    llmConfigs: [],
    llmUsageSettings: {
      chat: null,
      titleSummary: null,
      aiContinueWrite: null,
      webClip: null,
    },
    embeddingProvider: {
      currentConfigId: "",
      configs: [],
    },
    integration: {
      bilibili: {
        enabled: false,
        credentials: {
          SESSDATA: "",
          bfe_id: "",
        },
        userInfo: {
          name: "",
          avatar: "",
          isLogin: false,
          vipStatus: 0,
        },
      },
      youtube: {
        enabled: false,
        proxy: "",
      },
      notion: {
        enabled: false,
        token: "",
        userInfo: {
          name: "",
          email: "",
          avatar: "",
          isConnected: false,
        },
      },
    },
  },
  settingModalOpen: false,
};

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async () => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) {
      throw new Error("Client not initialized");
    }
    client.registerNotificationHandler("user-setting-changed", (newSetting) => {
      const { setting } = get();
      set({
        setting: produce(setting, (draft) => {
          merge(draft, newSetting as DeepPartial<ISetting>);
        }),
      });
    });
    const setting = (await client.sendRequest(
      "get-user-setting",
      null,
    )) as ISetting;
    try {
      console.log("setting", setting);
      const newSetting = cloneDeep(initialState.setting);
      merge(newSetting, setting);
      set({
        setting: newSetting,
        inited: true,
      });
    } catch (e) {
      console.error("initSetting error", e);
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
  updateLLMUsageSetting: (feature, config) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.llmUsageSettings[feature] = config;
      }),
    });
  },
  updateBilibiliCredentials: (credentials) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.bilibili.credentials = credentials;
      }),
    });
  },
  updateBilibiliUserInfo: (userInfo) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.bilibili.userInfo = userInfo;
      }),
    });
  },
  setBilibiliEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.bilibili.enabled = enabled;
      }),
    });
  },
  setYoutubeEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.youtube.enabled = enabled;
      }),
    });
  },
  updateYoutubeProxy: (proxy) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.youtube.proxy = proxy;
      }),
    });
  },
  updateNotionToken: (token) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.notion.token = token;
      }),
    });
  },
  updateNotionUserInfo: (userInfo) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.notion.userInfo = userInfo;
      }),
    });
  },
  setNotionEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.notion.enabled = enabled;
      }),
    });
  },
}));

export default useSettingStore;
