import { ModuleGroup, InitLayer, ModuleConfig } from "./types";

// 导入所有模块
import loggerModule from "../modules/logger";
import settingModule from "../modules/setting";
import resourceModule from "../modules/resource";
import fileModule from "../modules/file";
import extraModule from "../modules/extra";
import serverModule from "../modules/server";
import databaseModule from "../modules/database";
import collaborationModule from "../modules/collaboration";
import llmModule from "../modules/llm";
import streamFetchModule from "../modules/stream-fetch";
import mcpModule from "../modules/mcp";
import aliOssModule from "../modules/ali-oss";
import s3Module from "../modules/s3";
import webdavModule from "../modules/webdav";
import typstModule from "../modules/typst";
import tailwindRuntimeModule from "../modules/tailwind-runtime";
import skillModule from "../modules/skill";
import bilibiliCacheModule from "../modules/bilibili-cache";
import youtubeCacheModule from "../modules/youtube-cache";
import bilibiliAudioCacheModule from "../modules/bilibili-audio-cache";
import youtubeAudioCacheModule from "../modules/youtube-audio-cache";
import remoteVideoCacheModule from "../modules/remote-video-cache";
import remoteAudioCacheModule from "../modules/remote-audio-cache";
import remoteImageCacheModule from "../modules/remote-image-cache";
import podcastAudioModule from "../modules/podcast-audio";
import wereadModule from "../modules/weread";
import publishModule from "../modules/publish";
import todoReminderModule from "../modules/todo-reminder";
import holidayServiceModule from "../modules/holiday-service";
import transcriptionModule from "../modules/transcription";
import modelDownloaderModule from "../modules/model-downloader";
import markitdownModule from "../modules/markitdown";
import embeddingModelManager from "../modules/embedding-model-manager";
import vibeLearningDBManager from "../modules/vibe-learning-db";
import vibeLearningIndexQueue from "../modules/vibe-learning-index-queue";
import videoNoteIndexDBManager from "../modules/video-note-index-db";
import videoNoteIndexQueue from "../modules/video-note-index-queue";
import mainContentFtsIndexQueue from "../modules/main-content-fts-index-queue";
import mainContentVecIndexQueue from "../modules/main-content-vec-index-queue";
import embeddingIndexOrchestrator from "../modules/embedding-index-orchestrator";
import terminalModule from "../modules/terminal";
import updaterModule from "../modules/updater";
import pdfIndexQueue from "../modules/pdf-index-queue";
import pdfIndexOrchestrator from "../modules/pdf-index-orchestrator";
import whiteboardRecordingModule from "../modules/whiteboard-recording";

/**
 * 所有模块配置
 */
export const MODULE_CONFIGS: ModuleConfig[] = [
  // === IMMEDIATE 层：立即执行（窗口显示前必需） ===
  {
    name: "logger",
    group: ModuleGroup.ESSENTIAL,
    layer: InitLayer.IMMEDIATE,
    init: async () => {
      await loggerModule.init();
    },
  },
  {
    name: "setting",
    group: ModuleGroup.ESSENTIAL,
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => settingModule.init(),
  },
  {
    name: "file",
    group: ModuleGroup.ESSENTIAL,
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => fileModule.init(),
  },
  {
    name: "resource",
    group: ModuleGroup.ESSENTIAL,
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => resourceModule.init(),
  },
  {
    name: "whiteboard-recording",
    group: ModuleGroup.ESSENTIAL,
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => whiteboardRecordingModule.init(),
  },

  // === BACKGROUND 层：后台启动核心服务 ===
  {
    name: "server",
    group: ModuleGroup.SERVER,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => serverModule.init(),
  },
  {
    name: "database",
    group: ModuleGroup.DATABASE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => databaseModule.init(),
  },
  {
    name: "main-content-fts-index-queue",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => mainContentFtsIndexQueue.init(),
  },
  {
    name: "collaboration",
    group: ModuleGroup.CORE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => collaborationModule.init(),
  },
  {
    name: "extra",
    group: ModuleGroup.CORE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => extraModule.init(),
  },

  // === 应用级能力：与窗口无关，随应用后台并行初始化 ===
  // 原先标为 ON_DEMAND，靠「窗口类型 → 模块组」隐式拉起；新壳层接管主窗口后不再经过
  // 该入口，handler 从未注册（updater:check 即因此报 No handler registered）。
  // 这些模块 init 只注册 handler/建目录，重活均有延后机制，归入 BACKGROUND 后
  // 初始化不再依赖任何调用方。

  // 渲染模块
  {
    name: "typst",
    group: ModuleGroup.RENDER,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => typstModule.init(),
  },
  {
    name: "tailwind-runtime",
    group: ModuleGroup.RENDER,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => tailwindRuntimeModule.init(),
  },
  {
    name: "skill",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => skillModule.init(),
  },

  // 缓存模块
  {
    name: "bilibili-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => bilibiliCacheModule.init(),
  },
  {
    name: "youtube-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => youtubeCacheModule.init(),
  },
  {
    name: "bilibili-audio-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => bilibiliAudioCacheModule.init(),
  },
  {
    name: "youtube-audio-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => youtubeAudioCacheModule.init(),
  },
  {
    name: "remote-video-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => remoteVideoCacheModule.init(),
  },
  {
    name: "remote-audio-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => remoteAudioCacheModule.init(),
  },
  {
    name: "remote-image-cache",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => remoteImageCacheModule.init(),
  },
  {
    name: "podcast-audio",
    group: ModuleGroup.CACHE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => podcastAudioModule.init(),
  },

  // 云存储模块
  {
    name: "ali-oss",
    group: ModuleGroup.CLOUD,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => aliOssModule.init(),
  },
  {
    name: "s3",
    group: ModuleGroup.CLOUD,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => s3Module.init(),
  },
  {
    name: "webdav",
    group: ModuleGroup.CLOUD,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => webdavModule.init(),
  },

  // AI 模块
  {
    name: "llm",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => llmModule.init(),
  },
  {
    name: "mcp",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => mcpModule.init(),
  },
  {
    name: "stream-fetch",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: async () => {
      streamFetchModule.init();
    },
  },
  {
    name: "transcription",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => transcriptionModule.init(),
  },
  {
    name: "model-downloader",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => modelDownloaderModule.init(),
  },
  {
    name: "markitdown",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => markitdownModule.init(),
  },
  {
    name: "embedding-model-manager",
    group: ModuleGroup.AI,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => embeddingModelManager.init(),
  },

  // 集成模块
  {
    name: "weread",
    group: ModuleGroup.INTEGRATION,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => wereadModule.init(),
  },
  {
    name: "publish",
    group: ModuleGroup.INTEGRATION,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: async () => {
      publishModule.init();
    },
  },

  // 功能模块
  {
    name: "todo-reminder",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => todoReminderModule.init(),
  },
  {
    name: "holiday-service",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => holidayServiceModule.init(),
  },
  {
    name: "terminal",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => terminalModule.init(),
  },
  {
    name: "updater",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => updaterModule.init(),
  },

  // Vibe Learning 模块
  {
    name: "vibe-learning-db",
    group: ModuleGroup.DATABASE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => vibeLearningDBManager.init(),
  },
  {
    name: "vibe-learning-index-queue",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "vibe-learning-db", "markitdown"],
    init: () => vibeLearningIndexQueue.init(),
  },
  {
    name: "video-note-index-db",
    group: ModuleGroup.DATABASE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => videoNoteIndexDBManager.init(),
  },
  {
    name: "video-note-index-queue",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "video-note-index-db"],
    init: () => videoNoteIndexQueue.init(),
  },
  {
    name: "main-content-vec-index-queue",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => mainContentVecIndexQueue.init(),
  },
  {
    name: "pdf-index-queue",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => pdfIndexQueue.init(),
  },
  {
    name: "embedding-index-orchestrator",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: [
      "logger",
      "database",
      "main-content-vec-index-queue",
      "vibe-learning-index-queue",
      "video-note-index-queue",
    ],
    init: () => embeddingIndexOrchestrator.init(),
  },
  {
    name: "pdf-index-orchestrator",
    group: ModuleGroup.FEATURE,
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "pdf-index-queue"],
    init: () => pdfIndexOrchestrator.init(),
  },
];

/**
 * 需要 BackendWebSocketServer 的模块（特殊处理）
 * 这些模块的 init 方法需要传入 backendServer 参数
 */
export const WEBSOCKET_DEPENDENT_MODULES = [
  "user-setting",
  "pomodoro",
  "web-clip",
  "resource-sync",
];

/**
 * 根据模块名获取配置
 */
export function getModuleConfig(name: string): ModuleConfig | undefined {
  return MODULE_CONFIGS.find(c => c.name === name);
}

/**
 * 获取指定层级的所有模块
 */
export function getModulesByLayer(layer: InitLayer): ModuleConfig[] {
  return MODULE_CONFIGS.filter(c => c.layer === layer);
}

/**
 * 获取指定分组的所有模块
 */
export function getModulesByGroup(group: ModuleGroup): ModuleConfig[] {
  return MODULE_CONFIGS.filter(c => c.group === group);
}
