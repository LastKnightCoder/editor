/**
 * 设置分区清单 —— 单一信息架构（数据驱动，SettingsDialog 只负责渲染）。
 *
 * 对齐 legacy 设置弹窗全部 14 个子页（不遗漏），分组与排序按桌面设置惯例重排
 * （D-028，mockups/settings/ 方案 A 经典双栏）：通用 → 数据 → AI 服务 → 扩展 → 支持，
 * 使用频率递减、关于殿后；AI 服务按生成管线排序（对话 → 检索 → 生图 → 语音）。
 * 逐页重设计时替换对应条目的 component 即可，本文件即设置导航的唯一修改点。
 */

import type { ComponentType } from "react";
import {
  Palette,
  RefreshCw,
  Database,
  Upload,
  Sparkles,
  Layers,
  ImageIcon,
  Volume2,
  Mic,
  LayoutGrid,
  Video,
  Blocks,
  Wrench,
  Info,
  type LucideIcon,
} from "lucide-react";
import { PendingSection } from "./components/PendingSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { SyncSection } from "./sections/SyncSection";

export type SettingsSectionKey =
  | "appearance"
  | "sync"
  | "imageBed"
  | "publish"
  | "llm"
  | "embedding"
  | "imageGeneration"
  | "textToSpeech"
  | "transcription"
  | "module"
  | "whiteboardRecording"
  | "integration"
  | "misc"
  | "app";

export interface SettingsSectionDef {
  key: SettingsSectionKey;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
}

export interface SettingsSectionGroup {
  label: string;
  sections: SettingsSectionDef[];
}

/** 待设计子页的占位组件（逐页重设计时被真实分区替换） */
const pending = (label: string): ComponentType => {
  const Section = () => <PendingSection label={label} />;
  return Section;
};

export const SETTINGS_GROUPS: SettingsSectionGroup[] = [
  {
    label: "通用",
    sections: [{ key: "appearance", label: "外观", icon: Palette, component: AppearanceSection }],
  },
  {
    label: "数据",
    sections: [
      { key: "sync", label: "同步", icon: RefreshCw, component: SyncSection },
      { key: "imageBed", label: "资源存储", icon: Database, component: pending("资源存储") },
      { key: "publish", label: "发布", icon: Upload, component: pending("发布") },
    ],
  },
  {
    label: "AI 服务",
    sections: [
      { key: "llm", label: "大语言模型", icon: Sparkles, component: pending("大语言模型") },
      { key: "embedding", label: "嵌入模型", icon: Layers, component: pending("嵌入模型") },
      {
        key: "imageGeneration",
        label: "图片生成",
        icon: ImageIcon,
        component: pending("图片生成"),
      },
      { key: "textToSpeech", label: "文字转语音", icon: Volume2, component: pending("文字转语音") },
      { key: "transcription", label: "语音转录", icon: Mic, component: pending("语音转录") },
    ],
  },
  {
    label: "扩展",
    sections: [
      { key: "module", label: "模块功能", icon: LayoutGrid, component: pending("模块功能") },
      {
        key: "whiteboardRecording",
        label: "白板录制",
        icon: Video,
        component: pending("白板录制"),
      },
      { key: "integration", label: "集成", icon: Blocks, component: pending("集成") },
      { key: "misc", label: "杂项", icon: Wrench, component: pending("杂项") },
    ],
  },
  {
    label: "支持",
    sections: [{ key: "app", label: "关于软件", icon: Info, component: pending("关于软件") }],
  },
];

export const SETTINGS_SECTIONS: SettingsSectionDef[] = SETTINGS_GROUPS.flatMap(
  group => group.sections
);
