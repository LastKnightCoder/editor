/**
 * EditorServices implementation for desktop app
 * This implements the EditorServices interface from @tau/editor
 */

import type { EditorServices } from "@tau/editor/src";
import {
  importFromMarkdown as sharedImportFromMarkdown,
  isMarkdownLikeText,
} from "@tau/editor/src";
import type {
  ChatMessage as EditorChatMessage,
  ChatStreamOptions as EditorChatStreamOptions,
  ThemeColors,
} from "@tau/editor/src/types/services";
import type {
  ChatProviderConfig,
  ChatModelConfig,
} from "@tau/editor/src/types/services";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { ACCENT_COLORS, ACCENT_OKLCH } from "@/constants/accent";
import {
  selectFile,
  readTextFile,
  getHomeDir,
  convertFileSrc,
} from "@/commands/file";
import {
  createOrUpdateResource,
  decrementResourceRefCount,
} from "@/commands/resource";
import { TTSProviderFactory } from "@/utils/tts/TTSProviderFactory";
import { compileTypst } from "@/commands/typst";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import { openExternal } from "@/commands/extra";
import dayjs from "dayjs";

// Component imports
import ResourcePickerModal from "@/components/ResourcePickerModal";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";

import {
  getMarkdown,
  normalizeWebviewUrl,
  remoteResourceToLocal,
} from "@/utils";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { isBilibiliUrl, getVideoInfoByUrl } from "@/utils/bilibili";
import { chatStreamInner } from "@/hooks/useChatLLM";
import { shouldUseLocalVideoCache } from "@/utils/video";
import { getGithubCdnUrl } from "@/hooks/useGithubCdnUrl";

import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";
import { compileCustomBlockTailwind } from "@/services/tailwindRuntime";
import {
  createImageFileFromBase64,
  resolveImageInputFile,
  isProviderConfigValid,
  getActiveImageGenerationConfig,
  createProviderFromConfig,
} from "@/utils/image-generation";
import type { ImageResult } from "@/types/imageGeneration";

import { nodeFetch } from "@/commands/extra";

import type {
  ICreateResource,
  ResourceType,
  IResourceSource,
  RequestMessage,
  ProviderConfig,
  ModelConfig,
} from "@/types";

// Helper function to create a wrapper for quickCheckBilibiliUrl
const quickCheckBilibiliUrlSync = (url: string): boolean => {
  // Since the original function is async, we provide a sync version
  // that does a simple URL pattern check
  return isBilibiliUrl(url);
};

type ChatStreamInnerOptions = Parameters<typeof chatStreamInner>[3];

type ThemeClassConfig = ThemeColors;

const EDITOR_THEME_CLASSES: ThemeClassConfig = {
  hoverClass: "hover:bg-[var(--th-bg-hover)]",
  activeClass: "bg-[var(--th-accent-soft)] text-[var(--th-active-text)]",
  hoverTextClass: "hover:text-[var(--th-hover-text)]",
  borderClass: "border-[var(--th-border)]",
  hoverBorderClass: "hover:border-[var(--th-border-hover)]",
  focusBorderClass: "border-[var(--th-border-focus)]",
  textClass: "text-[var(--th-text)]",
  secondaryTextClass: "text-[var(--th-text-secondary)]",
  activeTextClass: "text-[var(--th-active-text)]",
  cardBorderClass: "border-[var(--th-border)]",
  cardBgClass: "bg-[var(--th-card-bg)]",
};

const getThemeColorsFromSetting = (setting: ISetting): ThemeColors => {
  const isDarkMode = !!setting.darkMode;
  const accent = setting.appearance?.accent ?? "indigo";
  const accentPair = ACCENT_COLORS[accent] ?? ACCENT_COLORS.indigo;
  const { h, c } = ACCENT_OKLCH[accent] ?? ACCENT_OKLCH.indigo;
  const s = Math.min(Math.round(c * 380), 70);
  return {
    ...EDITOR_THEME_CLASSES,
    accentColor: isDarkMode ? accentPair[1] : accentPair[0],
    accentSoftBg: isDarkMode
      ? `hsla(${h}, ${s}%, 70%, 0.35)`
      : `hsla(${h}, ${s}%, 30%, 0.25)`,
  };
};

const parseDurationToSeconds = (duration?: string): number | undefined => {
  if (!duration) return undefined;
  const parts = duration.split(":").map((value) => Number(value));
  if (parts.some((value) => Number.isNaN(value))) {
    return undefined;
  }
  return parts.reduce((acc, value) => acc * 60 + value, 0);
};

let cachedHomeDir: string | null = null;
void getHomeDir()
  .then((dir) => {
    cachedHomeDir = dir;
  })
  .catch(() => {
    // Keep the existing cached value on error
  });

const RESOURCE_SOURCE_TYPES: ReadonlyArray<IResourceSource["type"]> = [
  "content",
  "whiteboard",
  "podcast",
  "chat",
  "ebook",
];

const isSupportedResourceType = (value: string): value is ResourceType => {
  return ["image", "video", "audio", "pdf", "epub", "attachment"].includes(
    value,
  );
};

const normalizeResourceSource = (
  source?: { type?: string; id: number } | null,
): IResourceSource | null => {
  if (!source) return null;
  if (
    source.type &&
    RESOURCE_SOURCE_TYPES.includes(source.type as IResourceSource["type"])
  ) {
    return {
      type: source.type as IResourceSource["type"],
      id: source.id,
    };
  }
  return {
    type: "content",
    id: source.id,
  };
};

const inferResourceTypeFromFile = (file?: File): ResourceType => {
  if (!file?.type) {
    return "attachment";
  }
  const category = file.type.split("/")[0];
  if (category === "image" || category === "video" || category === "audio") {
    return category;
  }
  if (file.type === "application/pdf") {
    return "pdf";
  }
  if (file.type.includes("epub")) {
    return "epub";
  }
  return "attachment";
};

const resolveChatConfigs = (
  provider?: ChatProviderConfig | null,
  model?: ChatModelConfig | null,
): { providerConfig: ProviderConfig; modelConfig: ModelConfig } => {
  const { llmConfigs } = useSettingStore.getState().setting;
  if (!llmConfigs || llmConfigs.length === 0) {
    throw new Error("尚未配置任何 LLM Provider");
  }
  const providerId = provider?.id ?? llmConfigs[0].id;
  const providerConfig =
    llmConfigs.find((item) => item.id === providerId) ?? llmConfigs[0];
  const modelName = model?.name ?? (model?.id as string | undefined);
  const fallbackModel = providerConfig.models?.[0];
  const modelConfig =
    providerConfig.models?.find((item) => item.name === modelName) ??
    fallbackModel;
  if (!providerConfig || !modelConfig) {
    throw new Error("未找到可用的 LLM 配置");
  }
  return { providerConfig, modelConfig };
};

const mapChatStreamOptions = (
  options?: EditorChatStreamOptions,
): ChatStreamInnerOptions => ({
  onFinish: () => {
    options?.onFinish?.();
  },
  onUpdate: (full, incremental) => {
    options?.onUpdate?.(full, incremental);
  },
  onError: options?.onError,
});

const mapEditorMessages = (messages: EditorChatMessage[]): RequestMessage[] =>
  messages as unknown as RequestMessage[];

const createUploadResult = (url: string, file?: File) => ({
  id: url,
  url,
  type: inferResourceTypeFromFile(file),
  name: file?.name,
  path: url,
});

const uploadGeneratedImageResult = async (result: ImageResult, index = 0) => {
  const file = result.b64Json
    ? createImageFileFromBase64(
        result.b64Json,
        result.mimeType ?? "image/png",
        `editor-ai-image-${index + 1}`,
      )
    : result.url
      ? await resolveImageInputFile(result.url)
      : null;

  if (!file) {
    throw new Error("图片生成服务未返回可用图片");
  }

  const url = await uploadResourceCommand(file);
  if (!url) {
    throw new Error("图片已生成，但上传资源失败");
  }

  return {
    url,
    fileName: file.name,
    mimeType: file.type,
    revisedPrompt: result.revisedPrompt,
  };
};

const uploadFirstGeneratedImage = async (results: ImageResult[]) => {
  if (!results.length) {
    throw new Error("图片生成服务未返回图片");
  }
  return uploadGeneratedImageResult(results[0], 0);
};

export function createEditorServices(): EditorServices {
  return {
    resource: {
      upload: async (file: File) => {
        const url = await uploadResourceCommand(file);
        if (!url) {
          throw new Error("资源上传失败");
        }
        return createUploadResult(url, file);
      },

      create: async ({ name, path, type, source }) => {
        if (!path) {
          return;
        }
        const payload: ICreateResource = {
          name: name || "未命名资源",
          path,
          type: isSupportedResourceType(type ?? "")
            ? (type as ResourceType)
            : "attachment",
          source: normalizeResourceSource(source),
        };
        await createOrUpdateResource(payload);
      },

      decrementRef: async (resourceId: string) => {
        if (!resourceId) {
          return;
        }
        await decrementResourceRefCount(resourceId);
      },

      remoteResourceToLocal: async (url: string) => {
        return await remoteResourceToLocal(url);
      },

      useGithubCdnUrl: (url?: string) => {
        const cdn = useSettingStore.getState().setting.imageBed.github.cdn;
        return getGithubCdnUrl(url, cdn);
      },
    },

    // ==================== File Service ====================
    file: {
      select: async (options) => {
        return await selectFile(options);
      },

      readText: async (filePath: string) => {
        return await readTextFile(filePath);
      },

      getBaseName: (filePath: string) => {
        // Synchronous basename extraction
        const parts = filePath.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || "";
      },

      getHomeDir: async () => {
        return (
          cachedHomeDir || process.env.HOME || process.env.USERPROFILE || ""
        );
      },

      uploadFile: async (file: File) => {
        const url = await uploadResourceCommand(file);
        if (!url) {
          throw new Error("文件上传失败");
        }
        return url;
      },

      convertFileSrc: (filePath: string) => {
        return convertFileSrc(filePath);
      },
    },

    // ==================== Media Service ====================
    media: {
      getYoutubeInfo: async (url: string) => {
        const { integration } = useSettingStore.getState().setting;
        const info = await getYoutubeVideoInfo(
          url,
          integration.youtube.proxy || undefined,
        );
        if (!info) {
          throw new Error("获取 YouTube 视频信息失败");
        }
        return {
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
        };
      },

      getBilibiliInfo: async (url: string) => {
        const { integration } = useSettingStore.getState().setting;
        const info = await getVideoInfoByUrl(
          url,
          integration.bilibili.credentials,
        );
        return {
          title: info.title,
          thumbnail: info.cover,
          duration: parseDurationToSeconds(info.duration),
          author: info.up?.map((item) => item.name).join(", "),
        };
      },

      isYoutubeUrl,
      isBilibiliUrl,
      quickCheckBilibiliUrl: quickCheckBilibiliUrlSync,
      shouldUseLocalCache: (url: string) => shouldUseLocalVideoCache(url, true),
    },

    settings: {
      get: <T = any>(key: string): T => {
        const setting = useSettingStore.getState().setting;
        const keys = key.split(".");
        let value: any = setting;
        for (const k of keys) {
          value = value?.[k];
        }
        return value as T;
      },

      getYoutubeProxy: () => {
        return (
          useSettingStore.getState().setting.integration.youtube.proxy || null
        );
      },

      isDarkMode: () => {
        return useSettingStore.getState().setting.darkMode;
      },

      subscribe: (listener: () => void) => {
        return useSettingStore.subscribe((state, prevState) => {
          if (state.setting !== prevState.setting) {
            listener();
          }
        });
      },
    },

    theme: {
      current: () => {
        return useSettingStore.getState().setting.darkMode ? "dark" : "light";
      },

      colors: () => {
        return getThemeColorsFromSetting(useSettingStore.getState().setting);
      },
    },

    ai: {
      chatStream: async (params) => {
        const { providerConfig, modelConfig } = resolveChatConfigs(
          params.provider,
          params.model,
        );
        await chatStreamInner(
          providerConfig,
          modelConfig,
          mapEditorMessages(params.messages as EditorChatMessage[]),
          mapChatStreamOptions(params.options),
        );
      },

      chatLLMStream: async (provider, model, messages, options) => {
        const { providerConfig, modelConfig } = resolveChatConfigs(
          provider,
          model,
        );
        await chatStreamInner(
          providerConfig,
          modelConfig,
          mapEditorMessages(messages as EditorChatMessage[]),
          mapChatStreamOptions(options),
        );
      },

      textToSpeech: async (text: string, voiceId?: string) => {
        const provider = TTSProviderFactory.getTTSProvider();
        if (!provider || !provider.isConfigured()) {
          throw new Error("请先配置语音合成服务");
        }

        const setting = useSettingStore.getState().setting;
        const finalVoiceId =
          voiceId || setting.integration.podcastTTS?.currentVoiceId;
        if (!finalVoiceId) {
          throw new Error("请选择一个音色");
        }

        const audioBuffer = await provider.synthesizeSpeech(text, finalVoiceId);
        return new Blob([audioBuffer], { type: "audio/mp3" });
      },

      getVoiceList: async () => {
        const provider = TTSProviderFactory.getTTSProvider();
        if (!provider || !provider.isConfigured()) {
          return [];
        }
        const voices = await provider.getVoiceList();
        return voices.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description,
        }));
      },

      isTTSConfigured: () => {
        const provider = TTSProviderFactory.getTTSProvider();
        return provider?.isConfigured() ?? false;
      },
    },

    imageGeneration: {
      isAvailable: () => {
        const config = getActiveImageGenerationConfig();
        return isProviderConfigValid(config);
      },

      generateImage: async ({ prompt }) => {
        const config = getActiveImageGenerationConfig();
        if (!config || !isProviderConfigValid(config)) {
          throw new Error(
            "图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称",
          );
        }
        const provider = createProviderFromConfig(config);
        const results = await provider.generate({ config, prompt });
        return uploadFirstGeneratedImage(results);
      },

      editImage: async ({ prompt, images }) => {
        const config = getActiveImageGenerationConfig();
        if (!config || !isProviderConfigValid(config)) {
          throw new Error(
            "图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称",
          );
        }
        const normalizedImageUrls = images
          .map((item) => item.trim())
          .filter(Boolean);
        if (normalizedImageUrls.length === 0) {
          throw new Error("图片编辑至少需要一张输入图片");
        }
        const imageFiles = await Promise.all(
          normalizedImageUrls.map((item) => resolveImageInputFile(item)),
        );
        const provider = createProviderFromConfig(config);
        const results = await provider.edit({
          config,
          prompt,
          imageFiles,
        });
        return uploadFirstGeneratedImage(results);
      },
    },

    compiler: {
      typst: async (code: string) => {
        return await compileTypst(code);
      },

      tailwindRuntime: async (content: string) => {
        const trimmed = content?.trim();
        if (!trimmed) {
          return "";
        }
        return await compileCustomBlockTailwind(trimmed, "tsx");
      },
    },

    utility: {
      formatDate: (date, format) => {
        const d = dayjs(date);
        if (format) {
          return d.format(format);
        }
        return d.format("YYYY-MM-DD HH:mm:ss");
      },

      normalizeWebviewUrl: (url: string) => {
        return normalizeWebviewUrl(url);
      },

      openUrl: async (url: string) => {
        await openExternal(url);
      },

      getMarkdown,
      importFromMarkdown: sharedImportFromMarkdown,
      isMarkdownLikeText,
      nodeFetch,
    },

    components: {
      Image: LocalImage,
      Video: LocalVideo,
      Audio: LocalAudio,
      ResourcePickerModal,
      BilibiliVideoLoader,
      YoutubeVideoLoader,
      RemoteVideoLoader,
      BilibiliVideoSelectModal,
      YoutubeVideoSelectModal,
    },
  };
}
