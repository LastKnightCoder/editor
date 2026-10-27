/**
 * 对话块（D-057）：模型在对话里产出的 HTML / 思维导图 / 白板 / 图表等可预览内容。
 *
 * 渲染器声明式注册：`renderers/<Name>/index.tsx` 默认导出 defineBlockRenderer(...)，
 * 由 blockRegistry 以 glob 收集（文件即注册，无中心登记表）。渲染器只画内容本体与
 * 声明专属动作（usePreviewActions），预览框 chrome（标题 / 版本 / 预览⇄源码 / 复制 /
 * 全屏 / 更多 / 关闭）由 BlockPreviewFrame 统一绘制。
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type BlockType = string;

/** 块元数据：只放可序列化字段（快照模式整块经页面参数 JSON 传递） */
export interface BlockMetadata {
  title?: string;
  type: BlockType;
  language?: string;
  isGenerating?: boolean;
  /** 来源会话（pi 会话 id）；有 blockKey 时预览页据此从对话仓库实时取内容 */
  sourceChatId?: string;
  /** 会话内稳定身份（features/previews/model/chatBlocks） */
  blockKey?: string;
  version?: number;
  versionCount?: number;
}

export interface BlockData {
  id: string;
  type: BlockType;
  content: string;
  metadata: BlockMetadata;
}

export interface BlockPreviewProps {
  block: BlockData;
  /** 仍在流式生成（内容会继续变化） */
  generating: boolean;
}

export interface BlockInlineProps {
  block: BlockData;
  generating: boolean;
  /** 放大：进统一预览框 */
  onExpand?: () => void;
}

export interface BlockRenderer {
  type: BlockType;
  /** 等价的围栏语言（如 mindmap） */
  aliases?: string[];
  /** 类型名（界面显示） */
  label: string;
  icon: LucideIcon;
  /** 源码视图的高亮语言（Prism），默认 text */
  sourceLanguage?: string;
  /**
   * 对话里的展示：card = 块卡片，点击进预览；inline = 直接在对话里画出来，角上「放大」进预览。
   * 默认 card。
   */
  display?: "card" | "inline";
  /**
   * 生成中的预览策略：source-first = 先看源码流式写入、写完切预览（HTML，避免半截页面反复重载）；
   * keep-last = 渲染器自行保留上次成功结果；live = 边写边画。默认 keep-last。
   */
  streaming?: "source-first" | "keep-last" | "live";
  /** 预览底：white = 白纸（网页）；canvas = 点阵画布；默认 plain（纸色） */
  surface?: "white" | "canvas" | "plain";
  /** 头部类型行的补充说明（如「由 plantuml.com 渲染」） */
  note?: string;
  /** 内容是否构成该类型的块（如 HTML 须是完整文档）；默认都算 */
  accept?: (content: string) => boolean;
  /** 从内容取标题（版本分组也用它）；取不到返回 undefined */
  title?: (content: string) => string | undefined;
  Preview: ComponentType<BlockPreviewProps>;
  Inline?: ComponentType<BlockInlineProps>;
}

export function defineBlockRenderer(renderer: BlockRenderer): BlockRenderer {
  return renderer;
}
