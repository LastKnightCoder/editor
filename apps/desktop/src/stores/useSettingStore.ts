import { create } from "zustand";
import { produce } from "immer";
import { merge } from "lodash";
import { type ImageBorderRadiusPreset, type ImageShadowPreset } from "@tau/editor-media/types";

import { EGithubCDN } from "@/constants/github";
import { ETTSProvider } from "@/types/tts";
import type { TTSProviderSetting, TTSUsageConfig } from "@/types/tts";
import { MINIMAX_SPEECH_MODELS, MINIMAX_DEFAULT_SPEECH_MODEL } from "@/utils/tts/minimaxSpeech";
import type { EmbeddingProviderType } from "@/types/embedding";
import type { MinimaxSpeechModel } from "@/types/minimax";
import type { IPublishFaviconConfig } from "@/types/publish";
import {
  DEFAULT_OPENAI_IMAGE_BASE_URL,
  DEFAULT_OPENAI_IMAGE_MODEL,
} from "@/utils/image-generation";
import type { ImageGenerationStoreShape } from "@/types/imageGeneration";

export enum EImageBed {
  Local = "local",
  Github = "github",
  AliOSS = "aliOSS",
  S3 = "s3",
  WebDav = "webdav",
}

export enum ESync {
  Plugin = "plugin",
  AliOSS = "aliOSS",
  WebDav = "webdav",
  Github = "github",
}

export enum EPublishProvider {
  Github = "github",
  S3 = "s3",
  Local = "local",
}

import type { LLMProviderSetting, LLMUsageConfigV2 } from "@/types/pi-llm";
import {
  DEFAULT_TOOL_PERMISSION_MODE,
  type ToolPermissionMode,
} from "@/services/tool-permission/mode";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";

/** 图片生成配置的完整性清洗：损坏结构兜底、剔除无效项、修正失效的当前提供商指向 */
const normalizeImageGenerationConfig = (setting: Partial<ISetting>): void => {
  const img = (setting as Partial<ISetting> & { imageGeneration?: unknown }).imageGeneration;
  if (!img || typeof img !== "object") {
    (setting as { imageGeneration?: ImageGenerationStoreShape }).imageGeneration = {
      currentProviderId: "",
      providers: [],
    };
    return;
  }
  const imageGeneration = img as ImageGenerationStoreShape;
  imageGeneration.providers = Array.isArray(imageGeneration.providers)
    ? imageGeneration.providers.filter(provider => Boolean(provider?.id))
    : [];
  if (
    typeof imageGeneration.currentProviderId !== "string" ||
    !imageGeneration.providers.some(provider => provider.id === imageGeneration.currentProviderId)
  ) {
    imageGeneration.currentProviderId = imageGeneration.providers[0]?.id ?? "";
  }
};

/** legacy TTS 配置（integration.minimax + integration.podcastTTS）一次性迁移为 ttsProviders 多服务商模式 */
const migrateTTSProviders = (setting: ISetting): void => {
  if (setting.misc.tts?.providersMigrated) {
    return;
  }
  setting.misc.tts = {
    ...(setting.misc.tts ?? { providersMigrated: false }),
    providersMigrated: true,
  };
  const legacyMinimax = setting.integration?.minimax;
  const legacyPodcastTTS = setting.integration?.podcastTTS;
  if (setting.ttsProviders.length > 0 || !legacyMinimax?.apiKey?.trim()) {
    return;
  }
  const modelId = legacyPodcastTTS?.minimaxModel || MINIMAX_DEFAULT_SPEECH_MODEL;
  setting.ttsProviders = [
    {
      id: "minimax-legacy",
      name: "Minimax",
      providerType: ETTSProvider.Minimax,
      apiKey: legacyMinimax.apiKey.trim(),
      models: [modelId, ...MINIMAX_SPEECH_MODELS.filter(model => model !== modelId)].map(id => ({
        id,
      })),
    },
  ];
  setting.ttsUsageSettings.default = {
    providerId: "minimax-legacy",
    modelId,
    voiceId: legacyPodcastTTS?.currentVoiceId ?? "",
  };
};

/**
 * TTS 配置一致性修复（对齐 normalizeImageGenerationConfig）：当前用法指向
 * 已不存在的服务商/模型时回落，避免手工编辑 setting.json 或旧同步快照恢复后
 * 悬空指向静默失效（用户只看到"请先配置"而无自愈）。
 */
const normalizeTTSUsageConfig = (setting: ISetting): void => {
  setting.ttsProviders = Array.isArray(setting.ttsProviders)
    ? setting.ttsProviders
        .filter(provider => Boolean(provider?.id))
        // 手工编辑/损坏的 setting.json 可能缺 models，归一防止下游 some/length 抛错（启动路径无兜底）
        .map(provider => ({
          ...provider,
          models: Array.isArray(provider.models) ? provider.models : [],
        }))
    : [];
  const usage = setting.ttsUsageSettings.default;
  if (!usage) {
    return;
  }
  const provider = setting.ttsProviders.find(item => item.id === usage.providerId);
  if (!provider || !provider.models.some(model => model.id === usage.modelId)) {
    const fallback = provider ?? setting.ttsProviders.find(item => item.models.length > 0);
    setting.ttsUsageSettings.default = fallback
      ? {
          providerId: fallback.id,
          modelId: fallback.models[0]?.id ?? "",
          voiceId: "",
        }
      : null;
  }
};

export const mergeSettingWithDefaults = (setting: Partial<ISetting> | ISetting): ISetting => {
  const mergedSetting = structuredClone(defaultSetting);
  const imageGeneration = setting.imageGeneration ? structuredClone(setting.imageGeneration) : null;
  // 数组语义与 merge 的索引级深合并冲突，整体替换（同 imageGeneration 的处理理由）
  const ttsProviders = Array.isArray(setting.ttsProviders)
    ? structuredClone(setting.ttsProviders)
    : null;
  merge(mergedSetting, setting);
  if (imageGeneration) {
    mergedSetting.imageGeneration = imageGeneration;
  }
  if (ttsProviders) {
    mergedSetting.ttsProviders = ttsProviders;
  }
  normalizeImageGenerationConfig(mergedSetting);
  normalizeTransientSettingState(mergedSetting);
  migrateTTSProviders(mergedSetting);
  normalizeTTSUsageConfig(mergedSetting);
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
      shadow?: ImageShadowPreset;
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
    plugin?: { id: string; configurations: Record<string, unknown> };
    aliOSS: {
      bucket: string;
      region: string;
      path: string;
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
  /** TTS 服务商配置（多实例，对齐 llmProviders 模式） */
  ttsProviders: TTSProviderSetting[];
  /** TTS 当前用法：全局默认的提供商 + 模型 + 音色 */
  ttsUsageSettings: {
    default: TTSUsageConfig | null;
  };
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
    /** 笔记元信息（卡片 AI 标题、要点等）：配上即在后台处理全部笔记 */
    contentMetadata: LLMUsageConfigV2 | null;
    /** AI 洞见：在详情页点「AI 洞见」时对这一篇分析一次 */
    contentInsights: LLMUsageConfigV2 | null;
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
    tts: {
      /** legacy podcastTTS/minimax 配置是否已一次性迁移到 ttsProviders */
      providersMigrated: boolean;
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
  initSetting: () => Promise<void>;
  subscribeSettingNotifications: (clientId: string) => () => void;
  onFontSettingChange: (fontSetting: ISetting["fontSetting"]) => void;
  updateLLMUsageSetting: (
    feature: keyof ISetting["llmUsageSettings"],
    config: LLMUsageConfigV2 | null
  ) => void;
  updateTTSUsageSetting: (config: TTSUsageConfig | null) => void;
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
  setWebClipTranslateToChinese: (enabled: boolean) => void;
  setAutoCacheRemoteVideo: (enabled: boolean) => void;
  setAutoCacheRemoteImage: (enabled: boolean) => void;
  setAutoCacheRemoteAudio: (enabled: boolean) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
  setTranscriptionUseLLMOptimization: (enabled: boolean) => void;
  setTranscriptionSegmentationLevel: (level: "word" | "sentence") => void;
  setLongVideoSegmentationEnabled: (enabled: boolean) => void;
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

const normalizeTransientSettingState = (setting: ISetting) => {
  // 微信读书已改为插件（API Key 存插件私有存储，按工作区），旧字段丢弃不再保存
  delete (setting.integration as { weread?: unknown }).weread;
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

const loadCachedSetting = (): Partial<ISetting> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(SETTING_CACHE_KEY);
    if (!cached) {
      return null;
    }
    return JSON.parse(cached) as Partial<ISetting>;
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
    ttsProviders: [],
    ttsUsageSettings: {
      default: null,
    },
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
      contentMetadata: null,
      contentInsights: null,
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
      tts: {
        providersMigrated: false,
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
  subscribeSettingNotifications: (clientId: string) => {
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
      console.info("[SettingSync] 应用远端设置", { sourceClientId: sourceClientId || "unknown" });
      // 先登记再写入：同步器据此跳过这一次，避免把远端广播原样发回去（见 markRemoteSettingApplied）
      markRemoteSettingApplied(mergedSetting);
      set({
        setting: mergedSetting,
      });
    };

    client.registerNotificationHandler("user-setting-changed", handleSettingChanged);
    registeredSettingNotificationClient = client;
    registeredSettingNotificationHandler = handleSettingChanged;
    return () => {
      client.unregisterNotificationHandler("user-setting-changed", handleSettingChanged);
      if (registeredSettingNotificationHandler === handleSettingChanged) {
        registeredSettingNotificationClient = null;
        registeredSettingNotificationHandler = null;
      }
    };
  },
  initSetting: async () => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) throw new Error("Client not initialized");
    try {
      const setting = (await client.sendRequest("get-user-setting", null)) as ISetting;
      const newSetting = mergeSettingWithDefaults(setting);
      console.info("[SettingSync] 初始化设置完成");
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
        // 「账号与连接」的 Minimax 凭据与 ttsProviders 同步；若无 Minimax 实例
        // （迁移标记之后才在集成页连接的用户）则补建一个，避免"集成页已连接、
        // TTS 却提示未配置"的死胡同
        const minimaxProviders = draft.ttsProviders.filter(
          provider => provider.providerType === ETTSProvider.Minimax
        );
        if (minimaxProviders.length === 0) {
          if (apiKey.trim()) {
            draft.ttsProviders.push({
              id: `minimax-${Date.now().toString(36)}`,
              name: "Minimax",
              providerType: ETTSProvider.Minimax,
              apiKey,
              models: MINIMAX_SPEECH_MODELS.map(id => ({ id })),
            });
          }
          return;
        }
        for (const provider of minimaxProviders) {
          provider.apiKey = apiKey;
        }
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
  updateTTSUsageSetting: config => {
    const { setting } = get();
    set({
      setting: produce(setting, draft => {
        draft.ttsUsageSettings.default = config;
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
