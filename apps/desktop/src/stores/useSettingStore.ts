import { create } from "zustand";
import { produce } from "immer";
import { merge } from "lodash";
import { type ImageBorderRadiusPreset, type ImageShadowPreset } from "@tau/editor-media/types";

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
import type { ImageGenerationStoreShape, ImageProviderConfig } from "@/types/imageGeneration";

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

import type { LLMProviderSetting, LLMUsageConfigV2 } from "@/types/pi-llm";
import { migrateLlmSettingsToV2 } from "@/services/llmSettingsMigration";
import {
  DEFAULT_TOOL_PERMISSION_MODE,
  type ToolPermissionMode,
} from "@/services/tool-permission/mode";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";

const sanitizeDeprecatedLLMUsageSettings = <T extends Partial<ISetting>>(setting: T): T => {
  const nextSetting = setting as T & {
    llmUsageSettings?: Record<string, unknown>;
  };

  if (nextSetting.llmUsageSettings && typeof nextSetting.llmUsageSettings === "object") {
    delete nextSetting.llmUsageSettings.contentPolish;
    delete nextSetting.llmUsageSettings.autoTagging;
    delete nextSetting.llmUsageSettings.aiContinueWrite;
    delete nextSetting.llmUsageSettings.vibeLearningDocSummary;
  }

  return nextSetting;
};

const migrateImageGenerationConfig = <T extends Partial<ISetting>>(setting: T): void => {
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
        .filter((provider: Partial<ImageProviderConfig> | null) => Boolean(provider?.id))
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
    !img.providers.some((provider: ImageProviderConfig) => provider.id === img.currentProviderId)
  ) {
    img.currentProviderId = img.providers[0]?.id ?? "";
  }
};

/** LLM 设置一次性转化（见 services/llmSettingsMigration）：llmConfigs → llmProviders、
 *  llmUsageSettings 的 modelName 主键 → modelId，转化后删除旧字段 */
const migrateLLMSettings = (
  setting: Partial<ISetting> & { llmConfigs?: unknown; llmUsageSettings?: unknown }
) => {
  const legacy = setting.llmConfigs;
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  if (Array.isArray(setting.llmProviders) && setting.llmProviders.length > 0) {
    delete setting.llmConfigs;
    return;
  }
  const usage = (setting.llmUsageSettings ?? {}) as Record<
    string,
    { providerId: string; modelName: string }
  >;
  const result = migrateLlmSettingsToV2({ llmConfigs: legacy as never, llmUsageSettings: usage });
  setting.llmProviders = result.providers;
  setting.llmUsageSettings = result.usage as Partial<ISetting>["llmUsageSettings"];
  delete setting.llmConfigs;
};

const sanitizeAppearanceSetting = (setting: ISetting) => {
  delete (setting as ISetting & { darkMode?: boolean }).darkMode;
  const appearance = setting.appearance as
    (NonNullable<ISetting["appearance"]> & Record<string, unknown>) | undefined;
  if (!appearance) return;
  for (const field of ["accent", "backgroundType", "backgroundGlow", "backgroundAnimation"]) {
    delete appearance[field];
  }
};

export const mergeSettingWithDefaults = (setting: Partial<ISetting> | ISetting): ISetting => {
  migrateImageGenerationConfig(setting);
  // LLM 设置一次性转化：旧 llmConfigs（messageFormat×apiProtocol 二维适配）→ pi 对齐的
  // llmProviders，功能槽位 modelName 改主键 modelId，转化后删除旧字段不留兼容层
  migrateLLMSettings(setting as Partial<ISetting> & { llmConfigs?: unknown });
  const mergedSetting = structuredClone(defaultSetting);
  const imageGeneration = setting.imageGeneration ? structuredClone(setting.imageGeneration) : null;
  merge(mergedSetting, setting);
  if (imageGeneration) {
    mergedSetting.imageGeneration = imageGeneration;
  }
  sanitizeAppearanceSetting(mergedSetting);
  sanitizeDeprecatedLLMUsageSettings(mergedSetting);
  migrateImageGenerationConfig(mergedSetting);
  normalizeTransientSettingState(mergedSetting);
  // mermaid 渲染已改为原生 mermaid，移除旧缓存中的 beautiful-mermaid 配置
  delete (mergedSetting.misc as Record<string, unknown>).mermaid;
  // 功能模块开关已退役（所有模块恒开启），丢弃旧 setting.json 中的 module / moduleOrder 残留
  const legacyFields = mergedSetting as unknown as Record<string, unknown>;
  delete legacyFields.module;
  delete legacyFields.moduleOrder;
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
  transcription: {
    currentModel: string;
    downloadSource: "modelscope" | "huggingface";
    device: "cuda" | "cpu";
  };
  llmProviders: LLMProviderSetting[];
  imageGeneration: ImageGenerationStoreShape;
  /** 通用工具权限模式（D-060）：manual 手动确认 / acceptEdits 自动允许编辑 / bypass 跳过确认 */
  agentPermission: {
    mode: ToolPermissionMode;
  };
  /**
   * AI 执行命令用的 shell（M3-g）。空 = 自动检测（Windows 找 Git Bash，失败退 PowerShell）。
   * 只存用户覆盖：检测结果是本机事实，不入设置，免得换机器/重装后留个错路径。
   */
  agentShell: {
    path: string;
  };
  /**
   * AI 对话（对话页 / 停靠栏）的工作目录：新对话登记时以 defaultCwd 为准，之后每个对话各自记在目录行里。
   * 空 = 应用数据目录（~/.editor）。
   */
  agentWorkspace: {
    defaultCwd: string;
  };
  llmUsageSettings: {
    chat: LLMUsageConfigV2 | null;
    titleSummary: LLMUsageConfigV2 | null;
    webClip: LLMUsageConfigV2 | null;
    podcastGeneration: LLMUsageConfigV2 | null;
    flashcardGeneration: LLMUsageConfigV2 | null;
    aiJudgement: LLMUsageConfigV2 | null;
    transcriptionOptimization: LLMUsageConfigV2 | null;
    videoSummary: LLMUsageConfigV2 | null;
    videoEbookRewrite: LLMUsageConfigV2 | null;
    vibeLearningImageDescription: LLMUsageConfigV2 | null;
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
    transcription: {
      segmentationLevel: "word" | "sentence";
      useLLMOptimization: boolean;
      enableLongVideoSegmentation: boolean; // 启用长视频分段转录（>30分钟）
    };
    update: {
      autoCheck: boolean;
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
}

interface IState {
  inited: boolean;
  setting: ISetting;
}

interface IActions {
  initSetting: (clientId: string) => void;
  onFontSettingChange: (fontSetting: ISetting["fontSetting"]) => void;
  updateLLMUsageSetting: (
    feature: keyof ISetting["llmUsageSettings"],
    config: LLMUsageConfigV2 | null
  ) => void;
  setToolPermissionMode: (mode: ToolPermissionMode) => void;
  /** AI 执行命令用的 shell 路径（空串 = 交回自动检测） */
  setAgentShellPath: (path: string) => void;
  /** 新对话的默认工作目录（空串 = 应用数据目录） */
  setAgentDefaultCwd: (cwd: string) => void;
  updateBilibiliCredentials: (
    credentials: ISetting["integration"]["bilibili"]["credentials"]
  ) => void;
  updateBilibiliUserInfo: (userInfo: ISetting["integration"]["bilibili"]["userInfo"]) => void;
  setBilibiliEnabled: (enabled: boolean) => void;
  setYoutubeEnabled: (enabled: boolean) => void;
  updateYoutubeProxy: (proxy: string) => void;
  updateMinimaxApiKey: (apiKey: string) => void;
  setMinimaxEnabled: (enabled: boolean) => void;
  updateWeReadApiKey: (apiKey: string) => void;
  updateWeReadUserInfo: (userInfo: ISetting["integration"]["weread"]["userInfo"]) => void;
  setWeReadConnectionState: (
    payload: Pick<
      ISetting["integration"]["weread"],
      "connectionStatus" | "lastValidatedAt" | "statusReason"
    >
  ) => void;
  setWeReadEnabled: (enabled: boolean) => void;
  setWebClipTranslateToChinese: (enabled: boolean) => void;
  setAutoCacheRemoteVideo: (enabled: boolean) => void;
  setAutoCacheRemoteImage: (enabled: boolean) => void;
  setAutoCacheRemoteAudio: (enabled: boolean) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
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

const isSettingNotificationPayload = (payload: unknown): payload is SettingNotificationPayload => {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "setting" in (payload as Record<string, unknown>)
  );
};

const SETTING_CACHE_KEY = "user-setting-cache";

const normalizeWeReadTransientState = (weread: ISetting["integration"]["weread"]) => {
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
  sanitizeAppearanceSetting(setting);
  normalizeWeReadTransientState(setting.integration.weread);
  return setting;
};

export const buildPersistedSettingSnapshot = (setting: ISetting): ISetting => {
  return normalizeTransientSettingState(structuredClone(setting));
};

/**
 * 最近一次「由远端广播应用进来」的设置快照。
 *
 * 多窗口共用一份 setting.json：任一窗口改动 → 主进程保存并广播 → 其余窗口应用。
 * 若应用后各窗口的同步器再把它发回主进程，一次用户改动就会被放大成 N 次保存，
 * 且任意窗口间的细微差异都会变成永不收敛的来回写（实测 220 次发送放大成 3463 次保存，
 * 并把 setting.json 写坏，见交接文档坑 16）。所以远端来的快照不回灌。
 */
let lastRemoteAppliedSnapshotJson: string | null = null;

export const markRemoteSettingApplied = (setting: ISetting): void => {
  lastRemoteAppliedSnapshotJson = JSON.stringify(buildPersistedSettingSnapshot(setting));
};

/** 该快照是否正是刚刚从远端应用进来的（是则不该再发回去） */
export const isRemoteAppliedSnapshot = (snapshotJson: string): boolean =>
  lastRemoteAppliedSnapshotJson === snapshotJson;

export const getWeReadSettingDebugSummary = (weread: ISetting["integration"]["weread"]) => {
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
    window.localStorage.removeItem("chat-agent-type");
    window.localStorage.removeItem("chat-agent-working-directory");
    window.localStorage.removeItem("resource-store");
    window.localStorage.removeItem("rss-store");
    window.localStorage.removeItem("read-later-store");
    window.localStorage.removeItem("cards-management");
    window.localStorage.removeItem("small-component-sidebar");
    window.localStorage.removeItem("flashcard-center");
    window.localStorage.removeItem("vl-quiz-store");
    // pi 迁移遗留（M8）：旧聊天 store（M4 起事实源在 pi 会话文件）与渲染端提问 store（M3-b 起宿主原生）
    window.localStorage.removeItem("chat-message");
    window.localStorage.removeItem("ask-question-session");
    if (!cached) {
      return null;
    }
    const cachedSetting = JSON.parse(cached) as Partial<ISetting>;
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
    window.localStorage.setItem(SETTING_CACHE_KEY, JSON.stringify(persistedSetting));
  } catch (error) {
    console.error("Failed to persist cached setting", error);
  }
};

const initialState: IState = {
  inited: false,
  setting: {
    fontSetting: {
      chineseFont: "华文楷体",
      englishFont: "American TypeWriter",
      codeFont: "JetBrains Mono",
      fontSize: 16,
    },
    appearance: {
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
    transcription: {
      currentModel: "faster-whisper-base",
      downloadSource: "modelscope",
      device: "cuda",
    },
    llmProviders: [],
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
    agentPermission: {
      mode: DEFAULT_TOOL_PERMISSION_MODE,
    },
    agentShell: {
      path: "",
    },
    agentWorkspace: {
      defaultCwd: "",
    },
    llmUsageSettings: {
      chat: null,
      titleSummary: null,
      webClip: null,
      podcastGeneration: null,
      flashcardGeneration: null,
      aiJudgement: null,
      transcriptionOptimization: null,
      videoSummary: null,
      videoEbookRewrite: null,
      vibeLearningImageDescription: null,
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
      transcription: {
        segmentationLevel: "sentence",
        useLLMOptimization: false,
        enableLongVideoSegmentation: true,
      },
      update: {
        autoCheck: true,
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
  },
};

const defaultSetting = structuredClone(initialState.setting);
const cachedSetting = loadCachedSetting();
if (cachedSetting) {
  initialState.setting = mergeSettingWithDefaults(cachedSetting);
}

let registeredSettingNotificationClient:
  ReturnType<typeof useBackendWebsocketStore.getState>["client"] | null = null;
let registeredSettingNotificationHandler: ((payload: unknown) => void) | null = null;

const useSettingStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initSetting: async (clientId: string) => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) {
      throw new Error("Client not initialized");
    }
    if (registeredSettingNotificationClient && registeredSettingNotificationHandler) {
      registeredSettingNotificationClient.unregisterNotificationHandler(
        "user-setting-changed",
        registeredSettingNotificationHandler
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
      // 先登记再写入：同步器据此跳过这一次，避免把远端广播原样发回去（见 markRemoteSettingApplied）
      markRemoteSettingApplied(mergedSetting);
      set({
        setting: mergedSetting,
      });
    };

    client.registerNotificationHandler("user-setting-changed", handleSettingChanged);
    registeredSettingNotificationClient = client;
    registeredSettingNotificationHandler = handleSettingChanged;

    const setting = (await client.sendRequest("get-user-setting", null)) as ISetting;
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
  onFontSettingChange: fontSetting => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.fontSetting = fontSetting;
      }),
    });
  },
  setAgentShellPath: path => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.agentShell = { ...draft.agentShell, path };
      }),
    });
  },
  setAgentDefaultCwd: cwd => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.agentWorkspace = { ...draft.agentWorkspace, defaultCwd: cwd };
      }),
    });
  },
  setToolPermissionMode: mode => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.agentPermission = { ...draft.agentPermission, mode };
      }),
    });
  },
  updateLLMUsageSetting: (feature, config) => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.llmUsageSettings[feature] = config;
      }),
    });
  },
  updateBilibiliCredentials: credentials => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.bilibili.credentials = credentials;
      }),
    });
  },
  updateBilibiliUserInfo: userInfo => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.bilibili.userInfo = userInfo;
      }),
    });
  },
  setBilibiliEnabled: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.bilibili.enabled = enabled;
      }),
    });
  },
  setYoutubeEnabled: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.youtube.enabled = enabled;
      }),
    });
  },
  updateYoutubeProxy: proxy => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.youtube.proxy = proxy;
      }),
    });
  },
  updateMinimaxApiKey: apiKey => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.minimax.apiKey = apiKey;
      }),
    });
  },
  setMinimaxEnabled: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.minimax.enabled = enabled;
      }),
    });
  },
  updateWeReadApiKey: apiKey => {
    const { setting } = get();
    console.info("[WeReadDebug] 更新 API Key", {
      configured: Boolean(apiKey.trim()),
    });
    set({
      setting: produce(setting, draft => {
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
  updateWeReadUserInfo: userInfo => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.weread.userInfo = userInfo;
      }),
    });
  },
  setWeReadConnectionState: payload => {
    const { setting } = get();
    console.info("[WeReadDebug] 更新连接状态", {
      from: setting.integration.weread.connectionStatus,
      to: payload.connectionStatus,
      reason: payload.statusReason,
      lastValidatedAt: payload.lastValidatedAt,
    });
    set({
      setting: produce(setting, draft => {
        draft.integration.weread.connectionStatus = payload.connectionStatus;
        draft.integration.weread.lastValidatedAt = payload.lastValidatedAt;
        draft.integration.weread.statusReason = payload.statusReason;
      }),
    });
  },
  setWeReadEnabled: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.integration.weread.enabled = enabled;
      }),
    });
  },
  setWebClipTranslateToChinese: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.misc.webClip.translateToChinese = enabled;
      }),
    });
  },
  setAutoCacheRemoteVideo: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.misc.video.autoCacheRemote = enabled;
      }),
    });
  },
  setAutoCacheRemoteImage: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.misc.image.autoCacheRemote = enabled;
      }),
    });
  },
  setAutoCacheRemoteAudio: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.misc.audio.autoCacheRemote = enabled;
      }),
    });
  },
  setAutoSyncEnabled: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.sync.autoSyncEnabled = enabled;
      }),
    });
  },
  setAutoCheckUpdate: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.misc.update.autoCheck = enabled;
      }),
    });
  },
  setTranscriptionUseLLMOptimization: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
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
  setTranscriptionSegmentationLevel: level => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
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
  setLongVideoSegmentationEnabled: enabled => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
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
  setPodcastTTSProvider: provider => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
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
  setPodcastTTSMinimaxModel: model => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
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
  setPodcastTTSCurrentVoiceId: voiceId => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
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
  let prevPersistedSettingJson = JSON.stringify(buildPersistedSettingSnapshot(prevSetting));
  useSettingStore.subscribe(state => {
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
  });
}

export default useSettingStore;
