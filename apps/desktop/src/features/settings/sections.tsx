import { appTranslator } from "@/app/i18n/messages";
/**
 * 设置分区清单 —— 单一信息架构（数据驱动，SettingsScreen 只负责渲染）。
 *
 * 分区名按内容正名——
 * 「杂项」→ 剪藏与缓存、「集成」→ 账号与连接、「关于软件」→ 关于与更新；文字转语音与
 * 语音转录并为「语音」。分组：通用 → 数据 → 连接 → AI 服务 → 系统。
 * 页头（标题 + 说明）由 SettingsScreen 按 label / description 统一渲染，子页不再自绘。
 * 内置设置导航在此维护；插件管理与插件设置由独立插件页承载。
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
  Archive,
  ArrowLeftRight,
  Info,
  Globe,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { AppearanceSection } from "./sections/AppearanceSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { SyncSection } from "./sections/SyncSection";
import { ResourceSection } from "./sections/ResourceSection";
import { LLMSection } from "./sections/LLMSection";
import { EmbeddingSection } from "./sections/EmbeddingSection";
import { CacheSection } from "./sections/CacheSection";
import { TransferSection } from "./sections/TransferSection";
import { ImageGenerationSection } from "./sections/ImageGenerationSection";
import { VoiceSection } from "./sections/VoiceSection";
import { AboutSection } from "./sections/AboutSection";
import { BrowserExtensionSection } from "./sections/BrowserExtensionSection";

export type SettingsSectionKey =
  | "appearance"
  | "features"
  | "sync"
  | "imageBed"
  | "cache"
  | "transfer"
  | "integration"
  | "browserExtension"
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
    get label() {
      return appTranslator.t("settings.group.general");
    },
    sections: [
      {
        key: "appearance",
        get label() {
          return appTranslator.t("settings.appearance.label");
        },
        get description() {
          return appTranslator.t("settings.appearance.description");
        },
        icon: Palette,
        component: AppearanceSection,
      },
      {
        key: "features",
        get label() {
          return appTranslator.t("settings.features.label");
        },
        get description() {
          return appTranslator.t("settings.features.description");
        },
        icon: LayoutGrid,
        component: FeaturesSection,
      },
    ],
  },
  {
    get label() {
      return appTranslator.t("settings.group.data");
    },
    sections: [
      {
        key: "sync",
        get label() {
          return appTranslator.t("settings.sync.label");
        },
        get description() {
          return appTranslator.t("settings.sync.description");
        },
        icon: RefreshCw,
        component: SyncSection,
      },
      {
        key: "imageBed",
        get label() {
          return appTranslator.t("settings.imageBed.label");
        },
        get description() {
          return appTranslator.t("settings.imageBed.description");
        },
        icon: HardDrive,
        component: ResourceSection,
      },
      {
        key: "cache",
        get label() {
          return appTranslator.t("settings.cache.label");
        },
        get description() {
          return appTranslator.t("settings.cache.description");
        },
        icon: Archive,
        component: CacheSection,
      },
      {
        key: "transfer",
        get label() {
          return appTranslator.t("settings.transfer.label");
        },
        get description() {
          return appTranslator.t("settings.transfer.description");
        },
        icon: ArrowLeftRight,
        component: TransferSection,
      },
    ],
  },
  {
    get label() {
      return appTranslator.t("settings.group.connections");
    },
    sections: [
      {
        key: "browserExtension",
        get label() {
          return appTranslator.t("settings.browserExtension.label");
        },
        get description() {
          return appTranslator.t("settings.browserExtension.description");
        },
        icon: Globe,
        component: BrowserExtensionSection,
      },
    ],
  },
  {
    get label() {
      return appTranslator.t("settings.group.ai");
    },
    sections: [
      {
        key: "llm",
        get label() {
          return appTranslator.t("settings.llm.label");
        },
        get description() {
          return appTranslator.t("settings.llm.description");
        },
        icon: Sparkles,
        component: LLMSection,
      },
      {
        key: "embedding",
        get label() {
          return appTranslator.t("settings.embedding.label");
        },
        get description() {
          return appTranslator.t("settings.embedding.description");
        },
        icon: Layers,
        component: EmbeddingSection,
      },
      {
        key: "imageGeneration",
        get label() {
          return appTranslator.t("settings.imageGeneration.label");
        },
        get description() {
          return appTranslator.t("settings.imageGeneration.description");
        },
        icon: ImageIcon,
        component: ImageGenerationSection,
      },
      {
        key: "voice",
        get label() {
          return appTranslator.t("settings.voice.label");
        },
        get description() {
          return appTranslator.t("settings.voice.description");
        },
        icon: AudioLines,
        component: VoiceSection,
      },
    ],
  },
  {
    get label() {
      return appTranslator.t("settings.group.system");
    },
    sections: [
      {
        key: "app",
        get label() {
          return appTranslator.t("settings.app.label");
        },
        get description() {
          return appTranslator.t("settings.app.description");
        },
        icon: Info,
        component: AboutSection,
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSectionDef[] = SETTINGS_GROUPS.flatMap(
  group => group.sections
);
