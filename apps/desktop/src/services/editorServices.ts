/**
 * EditorServices implementation for desktop app
 * This implements the EditorServices interface from @tau/editor
 */

import type { EditorServices } from "@tau/editor/src";
import type {
  ChatMessage as EditorChatMessage,
  ChatStreamOptions as EditorChatStreamOptions,
  KnowledgeOptions as EditorKnowledgeOptions,
  ThemeColors,
} from "@tau/editor/src/types/services";
import type {
  ChatProviderConfig,
  ChatModelConfig,
} from "@tau/editor/src/types/services";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { selectFile, readTextFile, getHomeDir } from "@/commands/file";
import {
  createOrUpdateResource,
  decrementResourceRefCount,
} from "@/commands/resource";
import {
  createDataTable,
  updateDataTable,
  deleteDataTable,
  incrementDataTableRefCount,
} from "@/commands/data-table";
import { getNotionBlockInfo } from "@/commands/notion";
import { TTSProviderFactory } from "@/utils/tts/TTSProviderFactory";
import { compileTypst } from "@/commands/typst";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import { openExternal } from "@/commands/extra";
import dayjs from "dayjs";

// Component imports
import Database from "@/components/Database";
import WhiteBoard from "@/components/WhiteBoard";
import WhiteBoardSelectModal from "@/components/SelectWhiteBoardModal";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import NotionVideoSelectModal from "@/components/NotionVideoSelectModal";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";
import type { ComponentService } from "@tau/editor/src/types/services";

import { CommandParser, getMarkdown, normalizeWebviewUrl } from "@/utils";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { isBilibiliUrl, getVideoInfoByUrl } from "@/utils/bilibili";
import { parseNotionBlockId } from "@/utils/notion";
import { chatStreamInner } from "@/hooks/useChatLLM";
import { shouldUseLocalVideoCache } from "@/utils/video";

import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";

// Whiteboard commands
import {
  getAllWhiteBoards,
  createWhiteBoardContent,
  updateSubWhiteBoard,
  deleteWhiteBoard,
  getWhiteBoardContentById,
} from "@/commands/white-board";
import { compileCustomBlockTailwind } from "@/services/tailwindRuntime";

import { nodeFetch } from "@/commands/extra";

import type {
  ICreateResource,
  ResourceType,
  IResourceSource,
  CreateDataTable,
  UpdateDataTable,
  RequestMessage,
  ProviderConfig,
  ModelConfig,
  KnowledgeOptions,
} from "@/types";

// Helper function to create a wrapper for quickCheckBilibiliUrl
const quickCheckBilibiliUrlSync = (url: string): boolean => {
  // Since the original function is async, we provide a sync version
  // that does a simple URL pattern check
  return isBilibiliUrl(url);
};

// Wrapper class for CommandParser that implements AsyncIterable
class CommandParserWrapper implements AsyncIterable<unknown> {
  private parser: CommandParser;

  constructor() {
    this.parser = new CommandParser();
  }

  addText(text: string): void {
    this.parser.addText(text);
  }

  finish(): void {
    this.parser.finish();
  }

  error(): void {
    this.parser.error();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    // Implement async iteration over parser commands
    // This is a simple wrapper that yields parser state
    yield this.parser;
  }
}

type ChatStreamInnerOptions = Parameters<typeof chatStreamInner>[3];

type ThemeClassConfig = ThemeColors;

type ThemePreset = {
  light: ThemeColors;
  dark: ThemeColors;
};

const SOLID_THEME: ThemeClassConfig = {
  hoverClass: "hover:bg-gray-100 dark:hover:bg-gray-800",
  activeClass: "bg-[#eee] text-gray-900 dark:bg-gray-800 dark:text-gray-100",
  hoverTextClass: "hover:text-gray-900 dark:hover:text-gray-100",
  borderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
  hoverBorderClass: "hover:border-[#eaeaea] dark:hover:border-[#3a3a3a]",
  focusBorderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
  textClass: "text-gray-600 dark:text-gray-400",
  secondaryTextClass: "text-gray-400 dark:text-gray-500",
  activeTextClass: "text-gray-900 dark:text-gray-100",
  cardBorderClass: "border-gray-200 dark:border-gray-800",
  cardBgClass: "bg-gray-50/80 dark:bg-gray-900/50",
};

const GRADIENT_THEME_CLASS_MAP: Record<string, ThemeClassConfig> = {
  gradient1: {
    hoverClass: "hover:bg-purple-500/10 dark:hover:bg-purple-400/15",
    activeClass:
      "bg-purple-500/20 text-purple-700 dark:bg-purple-400/25 dark:text-purple-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-purple-600 dark:hover:text-purple-400",
    borderClass: "border-purple-200/30 dark:border-purple-400/20",
    hoverBorderClass:
      "hover:border-purple-300/50 dark:hover:border-purple-400/30",
    focusBorderClass: "border-purple-500/60 dark:border-purple-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-purple-700 dark:text-purple-200",
    cardBorderClass: "border-purple-200/30 dark:border-purple-400/20",
    cardBgClass: "bg-purple-50 dark:bg-purple-950/60",
  },
  gradient2: {
    hoverClass: "hover:bg-blue-500/10 dark:hover:bg-blue-400/15",
    activeClass:
      "bg-blue-500/20 text-blue-700 dark:bg-blue-400/25 dark:text-blue-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-blue-600 dark:hover:text-blue-400",
    borderClass: "border-blue-200/30 dark:border-blue-400/20",
    hoverBorderClass: "hover:border-blue-300/50 dark:hover:border-blue-400/30",
    focusBorderClass: "border-blue-500/60 dark:border-blue-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-blue-700 dark:text-blue-200",
    cardBorderClass: "border-blue-200/30 dark:border-blue-400/20",
    cardBgClass: "bg-blue-50 dark:bg-blue-950/60",
  },
  gradient3: {
    hoverClass: "hover:bg-orange-500/10 dark:hover:bg-orange-400/15",
    activeClass:
      "bg-orange-500/20 text-orange-700 dark:bg-orange-400/25 dark:text-orange-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-orange-600 dark:hover:text-orange-400",
    borderClass: "border-orange-200/30 dark:border-orange-400/20",
    hoverBorderClass:
      "hover:border-orange-300/50 dark:hover:border-orange-400/30",
    focusBorderClass: "border-orange-500/60 dark:border-orange-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-orange-700 dark:text-orange-200",
    cardBorderClass: "border-orange-200/30 dark:border-orange-400/20",
    cardBgClass: "bg-orange-50 dark:bg-orange-950/60",
  },
  gradient4: {
    hoverClass: "hover:bg-green-500/10 dark:hover:bg-green-400/15",
    activeClass:
      "bg-green-500/20 text-green-700 dark:bg-green-400/25 dark:text-green-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-green-600 dark:hover:text-green-400",
    borderClass: "border-green-200/30 dark:border-green-400/20",
    hoverBorderClass:
      "hover:border-green-300/50 dark:hover:border-green-400/30",
    focusBorderClass: "border-green-500/60 dark:border-green-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-green-700 dark:text-green-200",
    cardBorderClass: "border-green-200/30 dark:border-green-400/20",
    cardBgClass: "bg-green-50 dark:bg-green-950/60",
  },
  gradient5: {
    hoverClass: "hover:bg-pink-500/10 dark:hover:bg-pink-400/15",
    activeClass:
      "bg-pink-500/20 text-pink-700 dark:bg-pink-400/25 dark:text-pink-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-pink-600 dark:hover:text-pink-400",
    borderClass: "border-pink-200/30 dark:border-pink-400/20",
    hoverBorderClass: "hover:border-pink-300/50 dark:hover:border-pink-400/30",
    focusBorderClass: "border-pink-500/60 dark:border-pink-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-pink-700 dark:text-pink-200",
    cardBorderClass: "border-pink-200/30 dark:border-pink-400/20",
    cardBgClass: "bg-pink-50 dark:bg-pink-950/60",
  },
  gradient6: {
    hoverClass: "hover:bg-gray-500/10 dark:hover:bg-gray-400/15",
    activeClass:
      "bg-gray-500/20 text-gray-700 dark:bg-gray-400/25 dark:text-gray-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-gray-600 dark:hover:text-gray-400",
    borderClass: "border-gray-200/30 dark:border-gray-400/20",
    hoverBorderClass: "hover:border-gray-300/50 dark:hover:border-gray-400/30",
    focusBorderClass: "border-gray-500/60 dark:border-gray-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-gray-700 dark:text-gray-200",
    cardBorderClass: "border-gray-200/30 dark:border-gray-400/20",
    cardBgClass: "bg-gray-50 dark:bg-gray-800/60",
  },
  gradient7: {
    hoverClass: "hover:bg-cyan-500/10 dark:hover:bg-cyan-400/15",
    activeClass:
      "bg-cyan-500/20 text-cyan-700 dark:bg-cyan-400/25 dark:text-cyan-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-cyan-600 dark:hover:text-cyan-400",
    borderClass: "border-cyan-200/30 dark:border-cyan-400/20",
    hoverBorderClass: "hover:border-cyan-300/50 dark:hover:border-cyan-400/30",
    focusBorderClass: "border-cyan-500/60 dark:border-cyan-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-cyan-700 dark:text-cyan-200",
    cardBorderClass: "border-cyan-200/30 dark:border-cyan-400/20",
    cardBgClass: "bg-cyan-50 dark:bg-cyan-950/60",
  },
  gradient8: {
    hoverClass: "hover:bg-amber-500/10 dark:hover:bg-amber-400/15",
    activeClass:
      "bg-amber-500/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-amber-600 dark:hover:text-amber-400",
    borderClass: "border-amber-200/30 dark:border-amber-400/20",
    hoverBorderClass:
      "hover:border-amber-300/50 dark:hover:border-amber-400/30",
    focusBorderClass: "border-amber-500/60 dark:border-amber-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-amber-700 dark:text-amber-200",
    cardBorderClass: "border-amber-200/30 dark:border-amber-400/20",
    cardBgClass: "bg-amber-50 dark:bg-amber-950/60",
  },
  gradient9: {
    hoverClass: "hover:bg-red-500/10 dark:hover:bg-red-400/15",
    activeClass:
      "bg-red-500/20 text-red-700 dark:bg-red-400/25 dark:text-red-200 backdrop-blur-sm",
    hoverTextClass: "hover:text-red-600 dark:hover:text-red-400",
    borderClass: "border-red-200/30 dark:border-red-400/20",
    hoverBorderClass: "hover:border-red-300/50 dark:hover:border-red-400/30",
    focusBorderClass: "border-red-500/60 dark:border-red-400/50",
    textClass: "text-gray-700 dark:text-gray-300",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-red-700 dark:text-red-200",
    cardBorderClass: "border-red-200/30 dark:border-red-400/20",
    cardBgClass: "bg-red-50 dark:bg-red-950/60",
  },
};

const GRADIENT_ACCENTS = {
  gradient1: {
    light: {
      accentColor: "rgb(147, 51, 234)",
      accentSoftBg: "rgba(147, 51, 234, 0.2)",
    },
    dark: {
      accentColor: "rgb(168, 85, 247)",
      accentSoftBg: "rgba(168, 85, 247, 0.35)",
    },
  },
  gradient2: {
    light: {
      accentColor: "rgb(37, 99, 235)",
      accentSoftBg: "rgba(37, 99, 235, 0.2)",
    },
    dark: {
      accentColor: "rgb(59, 130, 246)",
      accentSoftBg: "rgba(59, 130, 246, 0.35)",
    },
  },
  gradient3: {
    light: {
      accentColor: "rgb(249, 115, 22)",
      accentSoftBg: "rgba(249, 115, 22, 0.2)",
    },
    dark: {
      accentColor: "rgb(251, 146, 60)",
      accentSoftBg: "rgba(251, 146, 60, 0.35)",
    },
  },
  gradient4: {
    light: {
      accentColor: "rgb(22, 163, 74)",
      accentSoftBg: "rgba(22, 163, 74, 0.2)",
    },
    dark: {
      accentColor: "rgb(34, 197, 94)",
      accentSoftBg: "rgba(34, 197, 94, 0.35)",
    },
  },
  gradient5: {
    light: {
      accentColor: "rgb(219, 39, 119)",
      accentSoftBg: "rgba(219, 39, 119, 0.2)",
    },
    dark: {
      accentColor: "rgb(236, 72, 153)",
      accentSoftBg: "rgba(236, 72, 153, 0.35)",
    },
  },
  gradient6: {
    light: {
      accentColor: "rgb(75, 85, 99)",
      accentSoftBg: "rgba(75, 85, 99, 0.2)",
    },
    dark: {
      accentColor: "rgb(107, 114, 128)",
      accentSoftBg: "rgba(107, 114, 128, 0.35)",
    },
  },
  gradient7: {
    light: {
      accentColor: "rgb(6, 182, 212)",
      accentSoftBg: "rgba(6, 182, 212, 0.2)",
    },
    dark: {
      accentColor: "rgb(34, 211, 238)",
      accentSoftBg: "rgba(34, 211, 238, 0.35)",
    },
  },
  gradient8: {
    light: {
      accentColor: "rgb(245, 158, 11)",
      accentSoftBg: "rgba(245, 158, 11, 0.2)",
    },
    dark: {
      accentColor: "rgb(251, 191, 36)",
      accentSoftBg: "rgba(251, 191, 36, 0.35)",
    },
  },
  gradient9: {
    light: {
      accentColor: "rgb(239, 68, 68)",
      accentSoftBg: "rgba(239, 68, 68, 0.2)",
    },
    dark: {
      accentColor: "rgb(248, 113, 113)",
      accentSoftBg: "rgba(248, 113, 113, 0.35)",
    },
  },
} as const;

const createThemePreset = (
  base: ThemeClassConfig,
  accent: {
    light: { accentColor: string; accentSoftBg: string };
    dark: { accentColor: string; accentSoftBg: string };
  },
): ThemePreset => {
  const lightTheme: ThemeColors = {
    ...base,
    accentColor: accent.light.accentColor,
    accentSoftBg: accent.light.accentSoftBg,
  };

  const darkTheme: ThemeColors = {
    ...base,
    accentColor: accent.dark.accentColor,
    accentSoftBg: accent.dark.accentSoftBg,
  };

  return {
    light: lightTheme,
    dark: darkTheme,
  };
};

const THEME_PRESETS: Record<string, ThemePreset> = {
  solid: createThemePreset(SOLID_THEME, {
    light: {
      accentColor: "hsl(168, 50%, 30%)",
      accentSoftBg: "hsla(168, 50%, 30%, 0.25)",
    },
    dark: {
      accentColor: "hsl(168, 50%, 70%)",
      accentSoftBg: "hsla(168, 50%, 70%, 0.35)",
    },
  }),
  gradient1: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient1,
    GRADIENT_ACCENTS.gradient1,
  ),
  gradient2: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient2,
    GRADIENT_ACCENTS.gradient2,
  ),
  gradient3: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient3,
    GRADIENT_ACCENTS.gradient3,
  ),
  gradient4: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient4,
    GRADIENT_ACCENTS.gradient4,
  ),
  gradient5: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient5,
    GRADIENT_ACCENTS.gradient5,
  ),
  gradient6: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient6,
    GRADIENT_ACCENTS.gradient6,
  ),
  gradient7: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient7,
    GRADIENT_ACCENTS.gradient7,
  ),
  gradient8: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient8,
    GRADIENT_ACCENTS.gradient8,
  ),
  gradient9: createThemePreset(
    GRADIENT_THEME_CLASS_MAP.gradient9,
    GRADIENT_ACCENTS.gradient9,
  ),
};

const getThemeColorsFromSetting = (setting: ISetting): ThemeColors => {
  const isDarkMode = !!setting.darkMode;
  const backgroundType = setting.appearance?.backgroundType ?? "solid";
  const preset = THEME_PRESETS[backgroundType] ?? THEME_PRESETS.gradient1;
  return isDarkMode ? preset.dark : preset.light;
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

const ensureKnowledgeOptions = (
  knowledge?: EditorKnowledgeOptions,
): KnowledgeOptions | undefined => knowledge as KnowledgeOptions | undefined;

const createUploadResult = (url: string, file?: File) => ({
  id: url,
  url,
  type: inferResourceTypeFromFile(file),
  name: file?.name,
  path: url,
});

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
    },

    // ==================== Data Table Service ====================
    dataTable: {
      create: async (payload) => {
        return await createDataTable(payload as CreateDataTable);
      },

      update: async (payload) => {
        return await updateDataTable(payload as UpdateDataTable);
      },

      incrementRef: async (tableId) => {
        if (typeof tableId === "number") {
          await incrementDataTableRefCount(tableId);
        }
      },

      delete: async (tableId) => {
        if (typeof tableId === "number") {
          await deleteDataTable(tableId);
        }
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

      getHomeDir: () => {
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

      getNotionInfo: async (input: string) => {
        const blockId = parseNotionBlockId(input);
        if (!blockId) {
          throw new Error("无法解析 Notion 区块标识");
        }
        const token =
          useSettingStore.getState().setting.integration.notion.token;
        if (!token) {
          throw new Error("尚未配置 Notion 集成");
        }
        const info = await getNotionBlockInfo(token, blockId);
        if (!info.success) {
          throw new Error(info.error || "获取 Notion 视频信息失败");
        }
        return {
          title: info.blockType ? `Notion ${info.blockType}` : "Notion 视频",
          thumbnail: info.videoUrl,
        };
      },

      isYoutubeUrl,
      isBilibiliUrl,
      quickCheckBilibiliUrl: quickCheckBilibiliUrlSync,
      shouldUseLocalCache: (url: string) => shouldUseLocalVideoCache(url, true),
    },

    whiteboard: {
      getAll: async () => {
        const whiteboards = await getAllWhiteBoards();
        const contents = whiteboards.flatMap(
          (wb) => wb.whiteBoardContentList || [],
        );
        return contents.map((content) => ({
          id: content.id,
          name: content.name,
          content: content.data,
          data: content.data,
        })) as any;
      },

      getById: async (id: number) => {
        const content = await getWhiteBoardContentById(id);
        if (!content) {
          return null;
        }
        return {
          id: content.id,
          name: content.name,
          content: content.data,
          data: content.data,
        } as any;
      },

      create: async (content: any) => {
        const result = await createWhiteBoardContent({
          name: "Untitled",
          data: content,
          imgUrl: "",
        } as any);
        return result.id;
      },

      update: async (id: number, content: any) => {
        await updateSubWhiteBoard(id, "Untitled", content);
      },

      delete: async (id: number) => {
        await deleteWhiteBoard(id);
      },
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
          ensureKnowledgeOptions(params.knowledge),
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

      CommandParser: CommandParserWrapper,

      getMarkdown,
      nodeFetch,
    },

    components: {
      Image: LocalImage,
      Video: LocalVideo,
      Audio: LocalAudio,
      Database,
      WhiteBoard,
      ResourcePickerModal,
      BilibiliVideoLoader,
      YoutubeVideoLoader,
      NotionVideoLoader,
      RemoteVideoLoader,
      BilibiliVideoSelectModal,
      YoutubeVideoSelectModal,
      NotionVideoSelectModal,
      WhiteBoardSelectModal,
    } as ComponentService,
  };
}
