/**
 * 设置分区清单 —— 单一信息架构（数据驱动，SettingsScreen 只负责渲染）。
 *
 * 2026-09-24 重排（mockups/settings/index.html 第三版定稿）：分区名按内容正名——
 * 「杂项」→ 剪藏与缓存、「集成」→ 账号与连接、「关于软件」→ 关于与更新；文字转语音与
 * 语音转录并为「语音」。分组：通用 → 数据 → 连接 → AI 服务 → 系统。
 * 页头（标题 + 说明）由 SettingsScreen 按 label / description 统一渲染，子页不再自绘。
 * 内置导航在此维护；插件只有一个管理入口，自定义分组在各插件详情内展示。
 */

import type { ComponentType } from "react";
import {
  Palette,
  RefreshCw,
  HardDrive,
  Sparkles,
  Layers,
  ImageIcon,
  AudioLines,
  Plug,
  Archive,
  ArrowLeftRight,
  Info,
  type LucideIcon,
} from "lucide-react";
import { AppearanceSection } from "./sections/AppearanceSection";
import { SyncSection } from "./sections/SyncSection";
import { ResourceSection } from "./sections/ResourceSection";
import { LLMSection } from "./sections/LLMSection";
import { EmbeddingSection } from "./sections/EmbeddingSection";
import { CacheSection } from "./sections/CacheSection";
import { TransferSection } from "./sections/TransferSection";
import { IntegrationSection } from "./sections/IntegrationSection";
import { ImageGenerationSection } from "./sections/ImageGenerationSection";
import { VoiceSection } from "./sections/VoiceSection";
import { AboutSection } from "./sections/AboutSection";
import { PluginsSettingsEntry } from "@/features/plugins/views/PluginsSettingsEntry";

export type SettingsSectionKey =
  | "plugins"
  | "appearance"
  | "sync"
  | "imageBed"
  | "cache"
  | "transfer"
  | "integration"
  | "llm"
  | "embedding"
  | "imageGeneration"
  | "voice"
  | "app";

export interface SettingsSectionDef {
  key: SettingsSectionKey;
  label: string;
  /** 页头说明：一句话讲清这一页管什么 */
  description: string;
  icon: LucideIcon;
  component: ComponentType;
}

export interface SettingsSectionGroup {
  label: string;
  sections: SettingsSectionDef[];
}

export const SETTINGS_GROUPS: SettingsSectionGroup[] = [
  {
    label: "通用",
    sections: [
      {
        key: "appearance",
        label: "外观",
        description: "主题、字体与内容图片的默认呈现，改动即刻生效",
        icon: Palette,
        component: AppearanceSection,
      },
    ],
  },
  {
    label: "数据",
    sections: [
      {
        key: "sync",
        label: "同步",
        description: "把数据库和本地资源文件同步到远端，全部手动触发",
        icon: RefreshCw,
        component: SyncSection,
      },
      {
        key: "imageBed",
        label: "资源存储",
        description: "笔记里插入的图片和附件上传到哪里",
        icon: HardDrive,
        component: ResourceSection,
      },
      {
        key: "cache",
        label: "剪藏与缓存",
        description: "网页剪藏行为、远程媒体的自动缓存与空间占用",
        icon: Archive,
        component: CacheSection,
      },
      {
        key: "transfer",
        label: "导入与导出",
        description: "从其它笔记工具迁入，或把内容连同图片打包带走",
        icon: ArrowLeftRight,
        component: TransferSection,
      },
    ],
  },
  {
    label: "连接",
    sections: [
      {
        key: "integration",
        label: "账号与连接",
        description: "第三方服务的账号与凭据，其它设置页从这里读取连接",
        icon: Plug,
        component: IntegrationSection,
      },
    ],
  },
  {
    label: "AI 服务",
    sections: [
      {
        key: "llm",
        label: "大语言模型",
        description: "接入服务商与模型，再为各项功能指定模型",
        icon: Sparkles,
        component: LLMSection,
      },
      {
        key: "embedding",
        label: "嵌入模型",
        description: "知识库检索用的向量模型，切换后会在后台重建索引",
        icon: Layers,
        component: EmbeddingSection,
      },
      {
        key: "imageGeneration",
        label: "图片生成",
        description: "文生图服务，兼容 OpenAI Images 接口",
        icon: ImageIcon,
        component: ImageGenerationSection,
      },
      {
        key: "voice",
        label: "语音",
        description: "音视频转录与语音合成",
        icon: AudioLines,
        component: VoiceSection,
      },
    ],
  },
  {
    label: "系统",
    sections: [
      {
        key: "plugins",
        label: "插件",
        description: "插件中心、已安装插件与插件设置",
        icon: Plug,
        component: PluginsSettingsEntry,
      },
      {
        key: "app",
        label: "关于与更新",
        description: "版本、更新与命令行工具",
        icon: Info,
        component: AboutSection,
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSectionDef[] = SETTINGS_GROUPS.flatMap(
  group => group.sections
);
