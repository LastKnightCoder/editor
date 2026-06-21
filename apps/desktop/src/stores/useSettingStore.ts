import { create } from "zustand";
import { produce } from "immer";
import { merge } from "lodash";
import type { MermaidRenderStyle, MermaidThemeName } from "@tau/shared";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "@tau/editor";

import { EGithubCDN } from "@/constants/github";
import type { WeReadSessionStatus } from "@/types/weread";
import { ETTSProvider } from "@/types/tts";
import type { EmbeddingProviderType } from "@/types/embedding";
import type { MinimaxSpeechModel } from "@/types/minimax";
import type { IPublishFaviconConfig } from "@/types/publish";
import { MINIMAX_DEFAULT_SPEECH_MODEL } from "@/utils/tts/minimaxSpeech";
import {
  DEFAULT_OPENAI_IMAGE_BASE_URL,
  DEFAULT_OPENAI_IMAGE_MODEL,
} from "@/utils/image-generation";
import type {
  ImageGenerationStoreShape,
  ImageProviderConfig,
} from "@/types/imageGeneration";

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

export enum EPublishProvider {
  Github = "github",
  S3 = "s3",
  Local = "local",
}

export type WhiteboardRecordingOutputFormat = "webm" | "mp4" | "mov" | "mkv";

import type { ProviderConfig, ModelConfig, LLMUsageConfig } from "@/types/llm";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";

export type { ProviderConfig, ModelConfig, LLMUsageConfig };

export const DEFAULT_MODULE_ORDER = [
  "card",
  "flashcard",
  "article",
  "whiteBoard",
  "project",
  "document",
  "dailyNote",
  "pdf",
  "vecDocuments",
  "calendar",
  "chatManagement",
  "skillManagement",
  "resourceManagement",
  "pomodoro",
  "todo",
  "question",
  "rssSubscription",
  "readLater",
  "feed",
  "weread",
  "webview",
  "settings",
];

const MODULE_KEY_SET = new Set(DEFAULT_MODULE_ORDER);

const sanitizeSettingModules = <T extends Partial<ISetting>>(setting: T): T => {
  const nextSetting = setting as T & {
    module?: Record<string, unknown>;
    moduleOrder?: string[];
  };

  if (nextSetting.module && typeof nextSetting.module === "object") {
    Object.keys(nextSetting.module).forEach((key) => {
      if (!MODULE_KEY_SET.has(key)) {
        delete nextSetting.module?.[key];
      }
    });
  }

  if (Array.isArray(nextSetting.moduleOrder)) {
    nextSetting.moduleOrder = nextSetting.moduleOrder.filter(
      (key, index, arr) => {
        return MODULE_KEY_SET.has(key) && arr.indexOf(key) === index;
      },
    );
  } else {
    nextSetting.moduleOrder = [...DEFAULT_MODULE_ORDER];
  }

  if (nextSetting.moduleOrder.length === 0) {
    nextSetting.moduleOrder = [...DEFAULT_MODULE_ORDER];
  }

  return nextSetting;
};

const sanitizeDeprecatedLLMUsageSettings = <T extends Partial<ISetting>>(
  setting: T,
): T => {
  const nextSetting = setting as T & {
    llmUsageSettings?: Record<string, unknown>;
  };

  if (
    nextSetting.llmUsageSettings &&
    typeof nextSetting.llmUsageSettings === "object"
  ) {
    delete nextSetting.llmUsageSettings.contentPolish;
    delete nextSetting.llmUsageSettings.autoTagging;
  }

  return nextSetting;
};

const migrateImageGenerationConfig = <T extends Partial<ISetting>>(
  setting: T,
): void => {
  const img = (setting as any).imageGeneration;
  if (!img) return;
  if (typeof img !== "object") {
    (setting as any).imageGeneration = {
      currentProviderId: "",
      providers: [],
    };
    return;
  }
  // 旧格式：{ baseUrl, apiKey, modelName } → 新格式：{ currentProviderId, providers[] }
  if (!("providers" in img)) {
    (setting as any).imageGeneration = {
      currentProviderId: "default-openai",
      providers: [
        {
          id: "default-openai",
          name: "OpenAI 兼容",
          providerType: "openai",
          baseUrl: img.baseUrl ?? DEFAULT_OPENAI_IMAGE_BASE_URL,
          apiKey: img.apiKey ?? "",
          modelName: img.modelName ?? DEFAULT_OPENAI_IMAGE_MODEL,
        },
      ],
    };
    return;
  }

  img.providers = Array.isArray(img.providers)
    ? img.providers
        .filter((provider: Partial<ImageProviderConfig> | null) =>
          Boolean(provider?.id),
        )
        .map((provider: Partial<ImageProviderConfig>) => ({
          id: String(provider.id),
          name: provider.name || "OpenAI 兼容",
          providerType: provider.providerType || "openai",
          baseUrl: provider.baseUrl ?? DEFAULT_OPENAI_IMAGE_BASE_URL,
          apiKey: provider.apiKey ?? "",
          modelName: provider.modelName ?? DEFAULT_OPENAI_IMAGE_MODEL,
        }))
    : [];

  if (
    typeof img.currentProviderId !== "string" ||
    !img.providers.some(
      (provider: ImageProviderConfig) => provider.id === img.currentProviderId,
    )
  ) {
    img.currentProviderId = img.providers[0]?.id ?? "";
  }
};

export const mergeSettingWithDefaults = (
  setting: Partial<ISetting> | ISetting,
): ISetting => {
  migrateImageGenerationConfig(setting);
  const mergedSetting = structuredClone(defaultSetting);
  const imageGeneration = setting.imageGeneration
    ? structuredClone(setting.imageGeneration)
    : null;
  merge(mergedSetting, setting);
  if (imageGeneration) {
    mergedSetting.imageGeneration = imageGeneration;
  }
  sanitizeSettingModules(mergedSetting);
  sanitizeDeprecatedLLMUsageSettings(mergedSetting);
  migrateImageGenerationConfig(mergedSetting);
  normalizeTransientSettingState(mergedSetting);
  return mergedSetting;
};

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
      | "gradient6"
      | "gradient7"
      | "gradient8"
      | "gradient9";
    backgroundAnimation?: boolean;
    image?: {
      borderRadius?: ImageBorderRadiusPreset;
      shadow?: ImageShadowPreset | boolean;
    };
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
    autoSyncEnabled: boolean;
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
    flashcard: {
      enable: boolean;
      name: "闪卡中心";
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
    calendar: {
      enable: boolean;
      name: "日历";
    };
    chatManagement: {
      enable: boolean;
      name: "聊天管理";
    };
    skillManagement: {
      enable: boolean;
      name: "Skill 管理";
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
    rssSubscription: {
      enable: boolean;
      name: "RSS 订阅";
    };
    readLater: {
      enable: boolean;
      name: "稍后读";
    };
    feed: {
      enable: boolean;
      name: "信息流";
    };
    webview: {
      enable: boolean;
      name: "网页浏览";
    };
    settings: {
      enable: boolean;
      name: "设置";
    };
  };
  moduleOrder: string[];
  darkMode: boolean;
  transcription: {
    currentModel: string;
    downloadSource: "modelscope" | "huggingface";
    device: "cuda" | "cpu";
  };
  llmConfigs: ProviderConfig[];
  imageGeneration: ImageGenerationStoreShape;
  llmUsageSettings: {
    chat: LLMUsageConfig | null;
    titleSummary: LLMUsageConfig | null;
    aiContinueWrite: LLMUsageConfig | null;
    webClip: LLMUsageConfig | null;
    podcastGeneration: LLMUsageConfig | null;
    flashcardGeneration: LLMUsageConfig | null;
    aiJudgement: LLMUsageConfig | null;
    transcriptionOptimization: LLMUsageConfig | null;
    videoSummary: LLMUsageConfig | null;
    videoEbookRewrite: LLMUsageConfig | null;
    vibeLearningImageDescription: LLMUsageConfig | null;
    vibeLearningDocSummary: LLMUsageConfig | null;
  };
  embeddingProvider: {
    currentConfigId: string;
    configs: Array<{
      id: string;
      name: string;
      providerType?: EmbeddingProviderType;
      source?: "modelscope" | "huggingface";
      apiKey: string;
      baseUrl: string;
      localModelDir?: string;
      batchSize?: number;
      devicePolicy?: "auto" | "cpu" | "cuda";
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
  searchModelProvider: {
    source: "modelscope" | "huggingface";
    localModelDir?: string;
    queryExpanderModel: string;
    rerankerModel: string;
    enableExpander: boolean;
    enableReranker: boolean;
    devicePolicy: "auto" | "cpu" | "cuda";
    batchSize: number;
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
      apiKey: string;
      connectionStatus: WeReadSessionStatus;
      lastValidatedAt: number;
      statusReason: string;
      userInfo: {
        isConnected: boolean;
      };
    };
    podcastTTS: {
      active: ETTSProvider;
      minimaxModel: MinimaxSpeechModel;
      currentVoiceId: string;
    };
  };
  misc: {
    webClip: {
      translateToChinese: boolean;
    };
    video: {
      autoCacheRemote: boolean;
    };
    image: {
      autoCacheRemote: boolean;
    };
    audio: {
      autoCacheRemote: boolean;
    };
    mermaid: {
      style: MermaidRenderStyle;
      lightTheme: MermaidThemeName;
      darkTheme: MermaidThemeName;
      useBeautifulMermaid: boolean;
    };
    transcription: {
      segmentationLevel: "word" | "sentence";
      useLLMOptimization: boolean;
      enableLongVideoSegmentation: boolean; // 启用长视频分段转录（>30分钟）
    };
  };
  publish: {
    active: EPublishProvider;
    github: {
      repo: string;
      branch: string;
      basePath: string;
      useGitCli: boolean;
      gitWorkingDir: string;
    };
    s3: {
      bucket: string;
      region: string;
      path: string;
      basePath: string;
    };
    local: {
      basePath: string;
    };
    site: {
      title: string;
      description: string;
      publicUrl: string;
      favicon?: IPublishFaviconConfig;
    };
  };
  whiteboardRecording: {
    autoStartRecording: boolean;
    saveDirectory: string;
    outputFormat: WhiteboardRecordingOutputFormat;
    cameraEnabledByDefault: boolean;
    microphoneEnabledByDefault: boolean;
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
  updateWeReadApiKey: (apiKey: string) => void;
  updateWeReadUserInfo: (
    userInfo: ISetting["integration"]["weread"]["userInfo"],
  ) => void;
  setWeReadConnectionState: (
    payload: Pick<
      ISetting["integration"]["weread"],
      "connectionStatus" | "lastValidatedAt" | "statusReason"
    >,
  ) => void;
  setWeReadEnabled: (enabled: boolean) => void;
  setWebClipTranslateToChinese: (enabled: boolean) => void;
  setAutoCacheRemoteVideo: (enabled: boolean) => void;
  setAutoCacheRemoteImage: (enabled: boolean) => void;
  setAutoCacheRemoteAudio: (enabled: boolean) => void;
  setMermaidStyle: (style: MermaidRenderStyle) => void;
  setMermaidLightTheme: (theme: MermaidThemeName) => void;
  setMermaidDarkTheme: (theme: MermaidThemeName) => void;
  setUseBeautifulMermaid: (enabled: boolean) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setTranscriptionUseLLMOptimization: (enabled: boolean) => void;
  setTranscriptionSegmentationLevel: (level: "word" | "sentence") => void;
  setLongVideoSegmentationEnabled: (enabled: boolean) => void;
  setPodcastTTSProvider: (provider: ETTSProvider) => void;
  setPodcastTTSMinimaxModel: (model: MinimaxSpeechModel) => void;
  setPodcastTTSCurrentVoiceId: (voiceId: string) => void;
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

const normalizeWeReadTransientState = (
  weread: ISetting["integration"]["weread"],
) => {
  weread.enabled = weread.enabled || Boolean(weread.apiKey?.trim());
  weread.connectionStatus = "unknown";
  weread.lastValidatedAt = 0;
  weread.statusReason = "";
  weread.userInfo = {
    isConnected: false,
  };

  if (!weread.apiKey?.trim()) {
    weread.enabled = false;
    weread.connectionStatus = "unknown";
    weread.lastValidatedAt = 0;
    weread.statusReason = "";
    weread.userInfo = {
      isConnected: false,
    };
  }
};

const normalizeTransientSettingState = (setting: ISetting) => {
  normalizeWeReadTransientState(setting.integration.weread);
  return setting;
};

export const buildPersistedSettingSnapshot = (setting: ISetting): ISetting => {
  return normalizeTransientSettingState(structuredClone(setting));
};

export const getWeReadSettingDebugSummary = (
  weread: ISetting["integration"]["weread"],
) => {
  return {
    enabled: weread.enabled,
    apiKeyConfigured: Boolean(weread.apiKey?.trim()),
    connectionStatus: weread.connectionStatus,
    lastValidatedAt: weread.lastValidatedAt,
    statusReason: weread.statusReason,
  };
};

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
      cachedSetting.moduleOrder = [...DEFAULT_MODULE_ORDER];
    }
    sanitizeSettingModules(cachedSetting);
    const migrated = sanitizeDeprecatedLLMUsageSettings(cachedSetting);
    migrateImageGenerationConfig(migrated);
    return migrated;
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
    const persistedSetting = buildPersistedSettingSnapshot(setting);
    window.localStorage.setItem(
      SETTING_CACHE_KEY,
      JSON.stringify(persistedSetting),
    );
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
      backgroundAnimation: false,
      image: {
        borderRadius: "none",
        shadow: "none",
      },
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
      autoSyncEnabled: false,
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
      flashcard: {
        enable: true,
        name: "闪卡中心",
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
      resourceManagement: {
        enable: true,
        name: "资源管理",
      },
      weread: {
        enable: true,
        name: "微信读书",
      },
      rssSubscription: {
        enable: true,
        name: "RSS 订阅",
      },
      readLater: {
        enable: true,
        name: "稍后读",
      },
      feed: {
        enable: true,
        name: "信息流",
      },
      webview: {
        enable: true,
        name: "网页浏览",
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
      skillManagement: {
        enable: true,
        name: "Skill 管理",
      },
      settings: {
        enable: true,
        name: "设置",
      },
    },
    moduleOrder: DEFAULT_MODULE_ORDER,
    transcription: {
      currentModel: "faster-whisper-base",
      downloadSource: "modelscope",
      device: "cuda",
    },
    llmConfigs: [],
    imageGeneration: {
      currentProviderId: "default-openai",
      providers: [
        {
          id: "default-openai",
          name: "OpenAI 兼容",
          providerType: "openai",
          baseUrl: DEFAULT_OPENAI_IMAGE_BASE_URL,
          apiKey: "",
          modelName: DEFAULT_OPENAI_IMAGE_MODEL,
        },
      ],
    },
    llmUsageSettings: {
      chat: null,
      titleSummary: null,
      aiContinueWrite: null,
      webClip: null,
      podcastGeneration: null,
      flashcardGeneration: null,
      aiJudgement: null,
      transcriptionOptimization: null,
      videoSummary: null,
      videoEbookRewrite: null,
      vibeLearningImageDescription: null,
      vibeLearningDocSummary: null,
    },
    embeddingProvider: {
      currentConfigId: "",
      configs: [],
    },
    searchModelProvider: {
      source: "modelscope",
      localModelDir: "",
      queryExpanderModel: "qwen3-0.6b",
      rerankerModel: "bge-reranker-v2-m3",
      enableExpander: true,
      enableReranker: true,
      devicePolicy: "auto",
      batchSize: 8,
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
        apiKey: "",
        connectionStatus: "unknown",
        lastValidatedAt: 0,
        statusReason: "",
        userInfo: {
          isConnected: false,
        },
      },
      podcastTTS: {
        active: ETTSProvider.Minimax,
        minimaxModel: MINIMAX_DEFAULT_SPEECH_MODEL,
        currentVoiceId: "",
      },
    },
    misc: {
      webClip: {
        translateToChinese: false,
      },
      video: {
        autoCacheRemote: true,
      },
      image: {
        autoCacheRemote: true,
      },
      audio: {
        autoCacheRemote: true,
      },
      mermaid: {
        style: "svg",
        lightTheme: "github-light",
        darkTheme: "github-dark",
        useBeautifulMermaid: true,
      },
      transcription: {
        segmentationLevel: "sentence",
        useLLMOptimization: false,
        enableLongVideoSegmentation: true,
      },
    },
    publish: {
      active: EPublishProvider.Github,
      github: {
        repo: "",
        branch: "gh-pages",
        basePath: "/",
        useGitCli: true,
        gitWorkingDir: "",
      },
      s3: {
        bucket: "",
        region: "",
        path: "",
        basePath: "/",
      },
      local: {
        basePath: "/",
      },
      site: {
        title: "",
        description: "",
        publicUrl: "",
        favicon: undefined,
      },
    },
    whiteboardRecording: {
      autoStartRecording: false,
      saveDirectory: "",
      outputFormat: "webm",
      cameraEnabledByDefault: false,
      microphoneEnabledByDefault: true,
    },
  },
  settingModalOpen: false,
};

const defaultSetting = structuredClone(initialState.setting);
const cachedSetting = loadCachedSetting();
if (cachedSetting) {
  initialState.setting = mergeSettingWithDefaults(cachedSetting);
}
applyAppearanceFromSetting(initialState.setting);

let registeredSettingNotificationClient:
  | ReturnType<typeof useBackendWebsocketStore.getState>["client"]
  | null = null;
let registeredSettingNotificationHandler: ((payload: unknown) => void) | null =
  null;

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async (clientId: string) => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) {
      throw new Error("Client not initialized");
    }
    if (
      registeredSettingNotificationClient &&
      registeredSettingNotificationHandler
    ) {
      registeredSettingNotificationClient.unregisterNotificationHandler(
        "user-setting-changed",
        registeredSettingNotificationHandler,
      );
    }

    const handleSettingChanged = (payload: unknown) => {
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

      const mergedSetting = mergeSettingWithDefaults(nextSetting);
      console.info("[SettingSync] 应用远端设置", {
        sourceClientId: sourceClientId || "unknown",
        weread: getWeReadSettingDebugSummary(mergedSetting.integration.weread),
      });
      set({
        setting: mergedSetting,
      });
    };

    client.registerNotificationHandler(
      "user-setting-changed",
      handleSettingChanged,
    );
    registeredSettingNotificationClient = client;
    registeredSettingNotificationHandler = handleSettingChanged;

    const setting = (await client.sendRequest(
      "get-user-setting",
      null,
    )) as ISetting;
    try {
      const newSetting = mergeSettingWithDefaults(setting);
      console.info("[SettingSync] 初始化设置完成", {
        weread: getWeReadSettingDebugSummary(newSetting.integration.weread),
      });
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
    const sanitizedModuleOrder = moduleOrder.filter((key, index, arr) => {
      return MODULE_KEY_SET.has(key) && arr.indexOf(key) === index;
    });
    set({
      setting: produce(setting, (draft) => {
        draft.moduleOrder =
          sanitizedModuleOrder.length > 0
            ? sanitizedModuleOrder
            : [...DEFAULT_MODULE_ORDER];
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
  updateWeReadApiKey: (apiKey) => {
    const { setting } = get();
    console.info("[WeReadDebug] 更新 API Key", {
      configured: Boolean(apiKey.trim()),
    });
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.apiKey = apiKey;
        draft.integration.weread.enabled = Boolean(apiKey.trim());
        if (!apiKey.trim()) {
          draft.integration.weread.connectionStatus = "unknown";
          draft.integration.weread.lastValidatedAt = 0;
          draft.integration.weread.statusReason = "";
          draft.integration.weread.userInfo = {
            isConnected: false,
          };
        }
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
  setWeReadConnectionState: (payload) => {
    const { setting } = get();
    console.info("[WeReadDebug] 更新连接状态", {
      from: setting.integration.weread.connectionStatus,
      to: payload.connectionStatus,
      reason: payload.statusReason,
      lastValidatedAt: payload.lastValidatedAt,
    });
    set({
      setting: produce(setting, (draft) => {
        draft.integration.weread.connectionStatus = payload.connectionStatus;
        draft.integration.weread.lastValidatedAt = payload.lastValidatedAt;
        draft.integration.weread.statusReason = payload.statusReason;
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
  setWebClipTranslateToChinese: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.misc.webClip.translateToChinese = enabled;
      }),
    });
  },
  setAutoCacheRemoteVideo: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.misc.video.autoCacheRemote = enabled;
      }),
    });
  },
  setAutoCacheRemoteImage: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.misc.image.autoCacheRemote = enabled;
      }),
    });
  },
  setAutoCacheRemoteAudio: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.misc.audio.autoCacheRemote = enabled;
      }),
    });
  },
  setMermaidStyle: (style) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.mermaid) {
          draft.misc.mermaid = {
            style: "svg",
            lightTheme: "github-light",
            darkTheme: "github-dark",
            useBeautifulMermaid: true,
          };
        }
        draft.misc.mermaid.style = style;
      }),
    });
  },
  setMermaidLightTheme: (theme) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.mermaid) {
          draft.misc.mermaid = {
            style: "svg",
            lightTheme: "github-light",
            darkTheme: "github-dark",
            useBeautifulMermaid: true,
          };
        }
        draft.misc.mermaid.lightTheme = theme;
      }),
    });
  },
  setMermaidDarkTheme: (theme) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.mermaid) {
          draft.misc.mermaid = {
            style: "svg",
            lightTheme: "github-light",
            darkTheme: "github-dark",
            useBeautifulMermaid: true,
          };
        }
        draft.misc.mermaid.darkTheme = theme;
      }),
    });
  },
  setUseBeautifulMermaid: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.mermaid) {
          draft.misc.mermaid = {
            style: "svg",
            lightTheme: "github-light",
            darkTheme: "github-dark",
            useBeautifulMermaid: true,
          };
        }
        draft.misc.mermaid.useBeautifulMermaid = enabled;
      }),
    });
  },
  setAutoSyncEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        draft.sync.autoSyncEnabled = enabled;
      }),
    });
  },
  setTranscriptionUseLLMOptimization: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.transcription) {
          draft.misc.transcription = {
            segmentationLevel: "sentence",
            useLLMOptimization: false,
            enableLongVideoSegmentation: true,
          };
        }
        draft.misc.transcription.useLLMOptimization = enabled;
      }),
    });
  },
  setTranscriptionSegmentationLevel: (level) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.transcription) {
          draft.misc.transcription = {
            segmentationLevel: "sentence",
            useLLMOptimization: false,
            enableLongVideoSegmentation: true,
          };
        }
        draft.misc.transcription.segmentationLevel = level;
        // 如果切换到句子级别，禁用LLM优化（因为句子级别不支持）
        if (level === "sentence") {
          draft.misc.transcription.useLLMOptimization = false;
        }
      }),
    });
  },
  setLongVideoSegmentationEnabled: (enabled) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.misc.transcription) {
          draft.misc.transcription = {
            segmentationLevel: "sentence",
            useLLMOptimization: false,
            enableLongVideoSegmentation: true,
          };
        }
        draft.misc.transcription.enableLongVideoSegmentation = enabled;
      }),
    });
  },
  setPodcastTTSProvider: (provider) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.integration.podcastTTS) {
          draft.integration.podcastTTS = {
            active: provider,
            minimaxModel: MINIMAX_DEFAULT_SPEECH_MODEL,
            currentVoiceId: "",
          };
        } else {
          draft.integration.podcastTTS.active = provider;
        }
      }),
    });
  },
  setPodcastTTSMinimaxModel: (model) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.integration.podcastTTS) {
          draft.integration.podcastTTS = {
            active: ETTSProvider.Minimax,
            minimaxModel: model,
            currentVoiceId: "",
          };
        } else {
          draft.integration.podcastTTS.minimaxModel = model;
        }
      }),
    });
  },
  setPodcastTTSCurrentVoiceId: (voiceId) => {
    const { setting } = get();
    set({
      setting: produce(setting, (draft) => {
        if (!draft.integration.podcastTTS) {
          draft.integration.podcastTTS = {
            active: ETTSProvider.Minimax,
            minimaxModel: MINIMAX_DEFAULT_SPEECH_MODEL,
            currentVoiceId: voiceId,
          };
        } else {
          draft.integration.podcastTTS.currentVoiceId = voiceId;
        }
      }),
    });
  },
}));

if (typeof window !== "undefined") {
  let prevSetting = useSettingStore.getState().setting;
  let prevPersistedSettingJson = JSON.stringify(
    buildPersistedSettingSnapshot(prevSetting),
  );
  useSettingStore.subscribe((state) => {
    if (state.setting === prevSetting) {
      return;
    }
    prevSetting = state.setting;
    const nextPersistedSetting = buildPersistedSettingSnapshot(state.setting);
    const nextPersistedSettingJson = JSON.stringify(nextPersistedSetting);
    if (nextPersistedSettingJson !== prevPersistedSettingJson) {
      prevPersistedSettingJson = nextPersistedSettingJson;
      persistSettingCache(state.setting);
    }
    applyAppearanceFromSetting(state.setting);
  });
}

export default useSettingStore;
