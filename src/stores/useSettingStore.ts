import { create } from "zustand";
import { produce } from "immer";
import { merge, cloneDeep } from "lodash";

import { EGithubCDN } from "@/constants/github";
import type { WeReadCookie } from "@/types/weread";

export enum EImageBed {
  Local = "local",
  Github = "github",
  AliOSS = "aliOSS",
  S3 = "s3",
  WebDav = "webdav",
}

export enum ESync {
  AliOSS = "aliOSS",
  S3 = "s3",
  WebDav = "webdav",
  Github = "github",
}

import type { ProviderConfig, ModelConfig, LLMUsageConfig } from "@/types/llm";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";

interface DoubaoVoiceCopyConfig {
  accessToken: string;
  secretKey: string;
  appid: string;
  token: string;
  currentSpeakerId: string;
}

export type { ProviderConfig, ModelConfig, LLMUsageConfig };

export const DEFAULT_MODULE_ORDER = [
  "card",
  "article",
  "whiteBoard",
  "project",
  "document",
  "dailyNote",
  "pdf",
  "vecDocuments",
  "goal",
  "calendar",
  "chatManagement",
  "promptManagement",
  "resourceManagement",
  "pomodoro",
  "todo",
  "question",
  "weread",
  "dataView",
  "settings",
];

export interface ISetting {
  fontSetting: {
    chineseFont: string;
    englishFont: string;
    fontSize: number;
    codeFont: string;
  };
  appearance?: {
    backgroundType:
      | "solid"
      | "gradient1"
      | "gradient2"
      | "gradient3"
      | "gradient4"
      | "gradient5"
      | "gradient6";
  };
  imageBed: {
    active: EImageBed;
    enableCompression: boolean;
    github: {
      repo: string;
      branch: string;
      cdn: EGithubCDN | null;
      pathPrefix: string;
    };
    aliOSS: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    local: {
      path: string;
    };
    s3: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    webdav: {
      pathPrefix: string;
    };
  };
  sync: {
    active: ESync;
    version: number;
    aliOSS: {
      bucket: string;
      region: string;
      path: string;
    };
    s3: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    webdav: {
      pathPrefix: string;
    };
    github: {
      repo: string;
      branch: string;
      pathPrefix: string;
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
    vecDocuments: {
      enable: boolean;
      name: "索引数据库";
    };
    goal: {
      enable: boolean;
      name: "进度管理";
    };
    calendar: {
      enable: boolean;
      name: "日历";
    };
    chatManagement: {
      enable: boolean;
      name: "聊天管理";
    };
    promptManagement: {
      enable: boolean;
      name: "Prompt 管理";
    };
    resourceManagement: {
      enable: boolean;
      name: "资源管理";
    };
    pomodoro: {
      enable: boolean;
      name: "番茄专注";
    };
    todo: {
      enable: boolean;
      name: "任务列表";
    };
    question: {
      enable: boolean;
      name: "问题管理";
    };
    weread: {
      enable: boolean;
      name: "微信读书";
    };
    dataView: {
      enable: boolean;
      name: "数据";
    };
    settings: {
      enable: boolean;
      name: "设置";
    };
  };
  moduleOrder: string[];
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
    podcastGeneration: LLMUsageConfig | null;
    contentPolish: LLMUsageConfig | null;
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
    minimax: {
      enabled: boolean;
      apiKey: string;
      userInfo: {
        isConnected: boolean;
      };
    };
    github: {
      enabled: boolean;
      token: string;
      user: {
        name: string;
        email: string;
      };
    };
    s3: {
      enabled: boolean;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint: string;
      urlStyle: "path" | "virtualHosted";
    };
    webdav: {
      enabled: boolean;
      url: string;
      username: string;
      password: string;
    };
    aliOSS: {
      enabled: boolean;
      accessKeyId: string;
      accessKeySecret: string;
    };
    weread: {
      enabled: boolean;
      loginMethod: "qr" | "manual";
      cookies: WeReadCookie[];
      lastCookieTime: number;
      userInfo: {
        name: string;
        vid: string;
        isConnected: boolean;
      };
    };
  };
  misc: {
    webClip: {
      translateToChinese: boolean;
    };
  };
}

interface IState {
  inited: boolean;
  setting: ISetting;
  settingModalOpen: boolean;
}

interface IActions {
  initSetting: (clientId: string) => void;
  setSettingModalOpen: (open: boolean) => void;
  onFontSettingChange: (fontSetting: ISetting["fontSetting"]) => void;
  onDarkModeChange: (darkMode: boolean) => void;
  updateModuleOrder: (moduleOrder: string[]) => void;
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
  updateMinimaxApiKey: (apiKey: string) => void;
  setMinimaxEnabled: (enabled: boolean) => void;
  updateWeReadCookies: (cookies: WeReadCookie[]) => void;
  clearWeReadCookies: () => void;
  updateWeReadUserInfo: (
    userInfo: ISetting["integration"]["weread"]["userInfo"],
  ) => void;
  setWeReadEnabled: (enabled: boolean) => void;
  setWeReadLoginMethod: (
    method: ISetting["integration"]["weread"]["loginMethod"],
  ) => void;
  setWebClipTranslateToChinese: (enabled: boolean) => void;
}

interface SettingNotificationPayload {
  setting: ISetting;
  clientId?: string;
}

const isSettingNotificationPayload = (
  payload: unknown,
): payload is SettingNotificationPayload => {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "setting" in (payload as Record<string, unknown>)
  );
};

const SETTING_CACHE_KEY = "user-setting-cache";

const loadCachedSetting = (): Partial<ISetting> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(SETTING_CACHE_KEY);
    if (!cached) {
      return null;
    }
    const cachedSetting = JSON.parse(cached) as Partial<ISetting>;
    // Migration: Add default moduleOrder if not present
    if (!cachedSetting.moduleOrder) {
      cachedSetting.moduleOrder = DEFAULT_MODULE_ORDER;
    }
    return cachedSetting;
  } catch (error) {
    console.error("Failed to parse cached setting", error);
    return null;
  }
};

const persistSettingCache = (setting: ISetting) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SETTING_CACHE_KEY, JSON.stringify(setting));
  } catch (error) {
    console.error("Failed to persist cached setting", error);
  }
};

const applyAppearanceFromSetting = (setting: ISetting) => {
  if (typeof document === "undefined") {
    return;
  }

  const isDark = setting.darkMode;
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.classList.toggle("dark", isDark);

  const target = document.body ?? document.documentElement;
  const { chineseFont, englishFont, fontSize, codeFont } = setting.fontSetting;
  const font = `${englishFont}, ${chineseFont}`;
  target.style.setProperty("--font", font);
  target.style.setProperty("--font-size", `${fontSize}px`);
  target.style.setProperty("--mono-font", `${codeFont}, ${font}, monospace`);
};

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
    appearance: {
      backgroundType: "solid",
    },
    imageBed: {
      active: EImageBed.Github,
      enableCompression: false,
      github: {
        repo: "",
        branch: "",
        cdn: null,
        pathPrefix: "",
      },
      aliOSS: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      local: {
        path: "resources",
      },
      s3: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      webdav: {
        pathPrefix: "",
      },
    },
    sync: {
      active: ESync.AliOSS,
      version: 1,
      aliOSS: {
        bucket: "",
        region: "",
        path: "/",
      },
      s3: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      webdav: {
        pathPrefix: "",
      },
      github: {
        repo: "",
        branch: "",
        pathPrefix: "",
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
      vecDocuments: {
        enable: true,
        name: "索引数据库",
      },
      goal: {
        enable: true,
        name: "进度管理",
      },
      resourceManagement: {
        enable: true,
        name: "资源管理",
      },
      weread: {
        enable: true,
        name: "微信读书",
      },
      dataView: {
        enable: true,
        name: "数据",
      },
      pomodoro: {
        enable: true,
        name: "番茄专注",
      },
      todo: {
        enable: true,
        name: "任务列表",
      },
      question: {
        enable: true,
        name: "问题管理",
      },
      calendar: {
        enable: true,
        name: "日历",
      },
      chatManagement: {
        enable: true,
        name: "聊天管理",
      },
      promptManagement: {
        enable: true,
        name: "Prompt 管理",
      },
      settings: {
        enable: true,
        name: "设置",
      },
    },
    moduleOrder: DEFAULT_MODULE_ORDER,
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
      podcastGeneration: null,
      contentPolish: null,
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
      minimax: {
        enabled: false,
        apiKey: "",
        userInfo: {
          isConnected: false,
        },
      },
      github: {
        enabled: false,
        token: "",
        user: {
          name: "",
          email: "",
        },
      },
      s3: {
        enabled: false,
        accessKeyId: "",
        secretAccessKey: "",
        endpoint: "",
        urlStyle: "path",
      },
      webdav: {
        enabled: false,
        url: "",
        username: "",
        password: "",
      },
      aliOSS: {
        enabled: false,
        accessKeyId: "",
        accessKeySecret: "",
      },
      weread: {
        enabled: false,
        loginMethod: "qr",
        cookies: [],
        lastCookieTime: 0,
        userInfo: {
          name: "",
          vid: "",
          isConnected: false,
        },
      },
    },
    misc: {
      webClip: {
        translateToChinese: false,
      },
    },
  },
  settingModalOpen: false,
};

const defaultSetting = cloneDeep(initialState.setting);
const cachedSetting = loadCachedSetting();
if (cachedSetting) {
  merge(initialState.setting, cachedSetting);
}
applyAppearanceFromSetting(initialState.setting);

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async (clientId: string) => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) {
      throw new Error("Client not initialized");
    }
    client.registerNotificationHandler(
      "user-setting-changed",
      (payload: unknown) => {
        if (!payload) {
          return;
        }

        let nextSetting: ISetting;
        let sourceClientId: string | undefined;

        if (isSettingNotificationPayload(payload)) {
          nextSetting = payload.setting;
          sourceClientId = payload.clientId;
        } else {
          nextSetting = payload as ISetting;
        }

        if (sourceClientId && sourceClientId === clientId) {
          return;
        }

        const mergedSetting = cloneDeep(defaultSetting);
        merge(mergedSetting, nextSetting);
        set({
          setting: mergedSetting,
        });
      },
    );
    const setting = (await client.sendRequest(
      "get-user-setting",
      null,
    )) as ISetting;
    try {
      const newSetting = cloneDeep(defaultSetting);
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
  updateModuleOrder: (moduleOrder) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.moduleOrder = moduleOrder;
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
  updateMinimaxApiKey: (apiKey) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.minimax.apiKey = apiKey;
      }),
    });
  },
  setMinimaxEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.minimax.enabled = enabled;
      }),
    });
  },
  updateWeReadCookies: (cookies) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.cookies = cookies;
        draft.integration.weread.lastCookieTime = Date.now();
        draft.integration.weread.enabled = cookies.length > 0;
      }),
    });
  },
  clearWeReadCookies: () => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.cookies = [];
        draft.integration.weread.lastCookieTime = Date.now();
        draft.integration.weread.userInfo = {
          name: "",
          vid: "",
          isConnected: false,
        };
        draft.integration.weread.enabled = false;
      }),
    });
  },
  updateWeReadUserInfo: (userInfo) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.userInfo = userInfo;
      }),
    });
  },
  setWeReadEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.enabled = enabled;
      }),
    });
  },
  setWeReadLoginMethod: (method) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.loginMethod = method;
      }),
    });
  },
  setWebClipTranslateToChinese: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.misc.webClip.translateToChinese = enabled;
      }),
    });
  },
}));

if (typeof window !== "undefined") {
  let prevSetting = useSettingStore.getState().setting;
  useSettingStore.subscribe((state) => {
    if (state.setting === prevSetting) {
      return;
    }
    prevSetting = state.setting;
    persistSettingCache(state.setting);
    applyAppearanceFromSetting(state.setting);
  });
}

export default useSettingStore;
