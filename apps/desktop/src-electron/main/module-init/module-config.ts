import { InitLayer, ModuleConfig } from "./types";

// 导入所有模块
import loggerModule from "../modules/logger";
import settingModule from "../modules/setting";
import resourceModule from "../modules/resource";
import fileModule from "../modules/file";
import extraModule from "../modules/extra";
import fetchModule from "../modules/fetch";
import pluginDevelopmentModule from "../modules/plugin-development";
import pluginLocalModule from "../modules/plugin-local";
import pluginServicesModule from "../modules/plugin-services";
import serverModule from "../modules/server";
import databaseModule from "../modules/database";
import collaborationModule from "../modules/collaboration";
import piAiRuntimeModule from "../modules/pi-ai-runtime";
import piSessionHostModule from "../modules/pi-session-host";
import modelUsageModule from "../modules/model-usage";
import browserBridgeModule from "../modules/browser-bridge";
import mcpModule from "../modules/mcp";
import aliOssModule from "../modules/ali-oss";
import s3Module from "../modules/s3";
import webdavModule from "../modules/webdav";
import typstModule from "../modules/typst";
import tailwindRuntimeModule from "../modules/tailwind-runtime";
import skillModule from "../modules/skill";
import bilibiliCacheModule from "../modules/bilibili-cache";
import youtubeCacheModule from "../modules/youtube-cache";
import remoteVideoCacheModule from "../modules/remote-video-cache";
import remoteAudioCacheModule from "../modules/remote-audio-cache";
import remoteImageCacheModule from "../modules/remote-image-cache";
import podcastAudioModule from "../modules/podcast-audio";
import ttsModule from "../modules/tts";
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
import knowledgeMapBuilder from "../modules/knowledge-map-builder";
import entityContextModule from "../modules/entity-context";
import docTasksModule from "../modules/doc-tasks";
import taskAssistantModule from "../modules/task-assistant";
import contentAiQueueModule from "../modules/content-ai-queue";
import contentInsightsModule from "../modules/content-insights";
import composeGatherModule from "../modules/compose-gather";
import knowledgeInsightsModule from "../modules/knowledge-insights-module";
import updaterModule from "../modules/updater";
import pdfIndexQueue from "../modules/pdf-index-queue";
import pdfIndexOrchestrator from "../modules/pdf-index-orchestrator";
import telemetryModule from "../modules/telemetry";
import perfMonitorModule from "../modules/perf-monitor";

/**
 * 所有模块配置
 */
export const MODULE_CONFIGS: ModuleConfig[] = [
  // === IMMEDIATE 层：立即执行（窗口显示前必需） ===
  {
    name: "logger",
    layer: InitLayer.IMMEDIATE,
    init: async () => {
      await loggerModule.init();
    },
  },
  {
    name: "setting",
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => settingModule.init(),
  },
  {
    name: "file",
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => fileModule.init(),
  },
  {
    name: "resource",
    layer: InitLayer.IMMEDIATE,
    dependencies: ["logger"],
    init: () => resourceModule.init(),
  },
  // === BACKGROUND 层：后台启动核心服务 ===
  {
    name: "plugin-services",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => pluginServicesModule.init(),
  },
  {
    name: "server",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => serverModule.init(),
  },
  {
    name: "database",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "plugin-local"],
    init: () => databaseModule.init(),
  },
  {
    name: "main-content-fts-index-queue",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => mainContentFtsIndexQueue.init(),
  },
  {
    name: "collaboration",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => collaborationModule.init(),
  },
  {
    name: "extra",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => extraModule.init(),
  },
  { name: "fetch", layer: InitLayer.BACKGROUND, dependencies: [], init: () => fetchModule.init() },
  {
    name: "plugin-local",
    layer: InitLayer.BACKGROUND,
    dependencies: [],
    init: () => pluginLocalModule.init(),
  },
  {
    name: "plugin-development",
    layer: InitLayer.BACKGROUND,
    dependencies: [],
    init: () => pluginDevelopmentModule.init(),
  },

  // === 应用级能力：与窗口无关，随应用后台并行初始化 ===
  // 初始化只注册 handler/建目录，重活延后执行，不依赖窗口入口。

  // 渲染模块
  {
    name: "typst",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => typstModule.init(),
  },
  {
    name: "tailwind-runtime",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => tailwindRuntimeModule.init(),
  },
  {
    name: "skill",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => skillModule.init(),
  },

  // 缓存模块
  {
    name: "bilibili-cache",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => bilibiliCacheModule.init(),
  },
  {
    name: "youtube-cache",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => youtubeCacheModule.init(),
  },
  {
    name: "remote-video-cache",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => remoteVideoCacheModule.init(),
  },
  {
    name: "remote-audio-cache",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => remoteAudioCacheModule.init(),
  },
  {
    name: "remote-image-cache",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => remoteImageCacheModule.init(),
  },
  {
    name: "podcast-audio",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "resource"],
    init: () => podcastAudioModule.init(),
  },
  {
    name: "tts",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => ttsModule.init(),
  },

  // 云存储模块
  {
    name: "ali-oss",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => aliOssModule.init(),
  },
  {
    name: "s3",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => s3Module.init(),
  },
  {
    name: "webdav",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: () => webdavModule.init(),
  },

  // AI 模块
  {
    // 模型用量审计（全局 usage.db）：pi-ai / pi-session 的采集点依赖它先就绪
    name: "model-usage",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => modelUsageModule.init(),
  },
  {
    name: "pi-ai",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "model-usage"],
    init: async () => {
      piAiRuntimeModule.init();
    },
  },
  {
    name: "pi-session",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "model-usage"],
    init: async () => {
      piSessionHostModule.init();
    },
  },
  {
    // 浏览器扩展桥（M5）：扩展侧栏对话由主进程直接驱动 pi 宿主会话，渲染层重载不再打断
    name: "browser-bridge",
    layer: InitLayer.BACKGROUND,
    dependencies: ["server", "pi-session"],
    init: async () => {
      browserBridgeModule.init();
    },
  },
  {
    name: "mcp",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => mcpModule.init(),
  },
  {
    name: "transcription",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => transcriptionModule.init(),
  },
  {
    name: "model-downloader",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => modelDownloaderModule.init(),
  },
  {
    name: "markitdown",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => markitdownModule.init(),
  },
  {
    name: "embedding-model-manager",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => embeddingModelManager.init(),
  },

  // 集成模块
  {
    name: "publish",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "setting"],
    init: async () => {
      publishModule.init();
    },
  },

  // 功能模块
  {
    name: "todo-reminder",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => todoReminderModule.init(),
  },
  {
    name: "holiday-service",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => holidayServiceModule.init(),
  },
  {
    name: "updater",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => updaterModule.init(),
  },

  // Vibe Learning 模块
  {
    name: "vibe-learning-db",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => vibeLearningDBManager.init(),
  },
  {
    name: "vibe-learning-index-queue",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "vibe-learning-db", "markitdown", "pi-ai"],
    init: () => vibeLearningIndexQueue.init(),
  },
  {
    name: "video-note-index-db",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => videoNoteIndexDBManager.init(),
  },
  {
    name: "video-note-index-queue",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "video-note-index-db"],
    init: () => videoNoteIndexQueue.init(),
  },
  {
    name: "knowledge-map-builder",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => knowledgeMapBuilder.init(),
  },
  {
    name: "entity-context",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => entityContextModule.init(),
  },
  {
    name: "doc-tasks",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => docTasksModule.init(),
  },
  {
    name: "task-assistant",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "doc-tasks", "collaboration"],
    init: () => taskAssistantModule.init(),
  },
  {
    name: "content-ai-queue",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "pi-ai"],
    init: () => contentAiQueueModule.init(),
  },
  {
    name: "content-insights",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "pi-ai"],
    init: () => contentInsightsModule.init(),
  },
  {
    name: "compose-gather",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "pi-ai"],
    init: () => composeGatherModule.init(),
  },
  {
    name: "topic-insights",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "pi-ai", "knowledge-map-builder"],
    init: () => knowledgeInsightsModule.init(),
  },
  {
    name: "main-content-vec-index-queue",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => mainContentVecIndexQueue.init(),
  },
  {
    name: "pdf-index-queue",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database"],
    init: () => pdfIndexQueue.init(),
  },
  {
    name: "embedding-index-orchestrator",
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
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger", "database", "pdf-index-queue"],
    init: () => pdfIndexOrchestrator.init(),
  },
  {
    name: "telemetry",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => telemetryModule.init(),
  },
  {
    name: "perf-monitor",
    layer: InitLayer.BACKGROUND,
    dependencies: ["logger"],
    init: () => perfMonitorModule.init(),
  },
];
