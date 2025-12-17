import React from "react";

/**
 * 块类型标识符
 */
export type BlockType = "html" | "pdf" | "video" | string;

/**
 * 块元数据
 */
export interface BlockMetadata {
  title?: string; // 块标题
  type: BlockType; // 块类型
  language?: string; // 代码语言（对应 markdown 的 language-xxx）
  icon?: React.ReactNode; // 类型图标
  description?: string; // 描述
  size?: string; // 大小信息
  timestamp?: number; // 创建/更新时间
  isGenerating?: boolean; // 是否正在生成中
}

/**
 * 块数据
 */
export interface BlockData {
  id: string; // 唯一标识符
  type: BlockType; // 块类型
  content: string; // 原始内容（代码字符串）
  metadata: BlockMetadata; // 元数据
}

/**
 * 块卡片渲染器 Props
 */
export interface BlockCardRendererProps {
  block: BlockData;
  isSelected: boolean;
  onClick: () => void;
  isLoading?: boolean;
}

/**
 * 块预览渲染器 Props
 */
export interface BlockPreviewRendererProps {
  block: BlockData;
  onClose: () => void;
}

/**
 * 块渲染器接口
 */
export interface BlockRenderer {
  type: BlockType; // 渲染器类型

  // 判断是否可以渲染该块
  canRender: (block: BlockData) => boolean;

  // 渲染卡片模式（在消息流中显示）- 可选，如果不提供则使用默认卡片
  renderCard?: (props: BlockCardRendererProps) => React.ReactNode;

  // 渲染预览模式（在右侧面板中显示）
  renderPreview: (props: BlockPreviewRendererProps) => React.ReactNode;

  // 可选：提取元数据
  extractMetadata?: (content: string) => Partial<BlockMetadata>;
}

/**
 * 块预览状态
 */
export interface BlockPreviewState {
  currentBlock: BlockData | null;
  isOpen: boolean;
  isLoading: boolean;
}
