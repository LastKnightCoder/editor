/**
 * 设置分区清单 —— 单一信息架构（数据驱动，SettingsDialog 只负责渲染）。
 *
 * 2026-09-24 重排（mockups/settings/index.html 第三版定稿）：分区名按内容正名——
 * 「杂项」→ 剪藏与缓存、「集成」→ 账号与连接、「关于软件」→ 关于与更新；文字转语音与
 * 语音转录并为「语音」。分组：通用 → 数据 → 连接 → AI 服务 → 系统。
 * 页头（标题 + 说明）由 SettingsDialog 按 label / description 统一渲染，子页不再自绘；
 * keywords 供导航搜索命中分区内的设置项名。
 * 11 个分区已全部落地（D-036）；本文件即设置导航的唯一修改点。
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
  LayoutGrid,
  Plug,
  Archive,
  Info,
  type LucideIcon,
} from "lucide-react";
import { AppearanceSection } from "./sections/AppearanceSection";
import { SyncSection } from "./sections/SyncSection";
import { ResourceSection } from "./sections/ResourceSection";
import { LLMSection } from "./sections/LLMSection";
import { EmbeddingSection } from "./sections/EmbeddingSection";
import { ModuleSection } from "./sections/ModuleSection";
import { CacheSection } from "./sections/CacheSection";
import { IntegrationSection } from "./sections/IntegrationSection";
import { ImageGenerationSection } from "./sections/ImageGenerationSection";
import { VoiceSection } from "./sections/VoiceSection";
import { AboutSection } from "./sections/AboutSection";

export type SettingsSectionKey =
  | "appearance"
  | "module"
  | "sync"
  | "imageBed"
  | "cache"
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
  /** 导航搜索的额外命中词（分区内的设置项名） */
  keywords?: string[];
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
        keywords: ["主题", "深色", "浅色", "字体", "字号", "代码字体", "图片圆角", "图片阴影"],
        component: AppearanceSection,
      },
      {
        key: "module",
        label: "功能模块",
        description: "关闭的模块从侧栏和命令面板中隐藏，数据保留",
        icon: LayoutGrid,
        keywords: ["模块", "侧栏"],
        component: ModuleSection,
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
        keywords: [
          "WebDAV",
          "S3",
          "OSS",
          "GitHub",
          "远程",
          "数据库",
          "资源同步",
          "新建数据库",
          "黑名单",
        ],
        component: SyncSection,
      },
      {
        key: "imageBed",
        label: "资源存储",
        description: "笔记里插入的图片和附件上传到哪里",
        icon: HardDrive,
        keywords: ["图床", "上传", "本地目录"],
        component: ResourceSection,
      },
      {
        key: "cache",
        label: "剪藏与缓存",
        description: "网页剪藏行为、远程媒体的自动缓存与空间占用",
        icon: Archive,
        keywords: ["缓存", "翻译", "视频缓存", "音频缓存", "图片缓存"],
        component: CacheSection,
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
        keywords: ["集成", "Bilibili", "YouTube", "微信读书", "Minimax", "Token", "API Key"],
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
        keywords: ["LLM", "服务商", "模型", "功能分配", "API Key"],
        component: LLMSection,
      },
      {
        key: "embedding",
        label: "嵌入模型",
        description: "知识库检索用的向量模型，切换后会在后台重建索引",
        icon: Layers,
        keywords: ["向量", "Embedding"],
        component: EmbeddingSection,
      },
      {
        key: "imageGeneration",
        label: "图片生成",
        description: "文生图服务，兼容 OpenAI Images 接口",
        icon: ImageIcon,
        keywords: ["文生图"],
        component: ImageGenerationSection,
      },
      {
        key: "voice",
        label: "语音",
        description: "音视频转录与语音合成",
        icon: AudioLines,
        keywords: ["转录", "whisper", "TTS", "文字转语音", "断句"],
        component: VoiceSection,
      },
    ],
  },
  {
    label: "系统",
    sections: [
      {
        key: "app",
        label: "关于与更新",
        description: "版本、更新与命令行工具",
        icon: Info,
        keywords: ["版本", "更新", "命令行"],
        component: AboutSection,
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSectionDef[] = SETTINGS_GROUPS.flatMap(
  group => group.sections
);
