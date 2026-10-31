/**
 * 发布内容类型
 */
export type PublishContentType = "card" | "article" | "project";

export interface PublishSiteConfig {
  templateId?: string;
  title: string;
  publicUrl?: string;
  favicon?: IPublishFaviconConfig;
  /** 按模板 id 保存的站点字段取值，发布时只取当前模板并按其声明解析 */
  fields?: Record<string, Record<string, import("@tau/plugins").JsonValue>>;
}
export interface PublishRequest {
  providerType: "local" | "plugin";
  pluginId?: string;
  providerConfig?: import("@tau/plugins").JsonValue;
  basePath?: string;
  siteConfig: PublishSiteConfig;
  settings?: IPublishAppearanceSettings;
  options?: IUploadOptions;
  editorContext?: import("@tau/plugins/rendering").PluginRenderContext;
}
export interface IUploadOptions {
  maxRetries?: number;
  retryDelay?: number;
  concurrency?: number;
}
export const DEFAULT_UPLOAD_OPTIONS: Required<IUploadOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  concurrency: 10,
};

/**
 * 发布选择记录
 */
export interface IPublishSelection {
  id: number;
  contentType: PublishContentType;
  contentId: number;
  parentPath: string;
  selected: boolean;
  updateTime: number;
}

/**
 * 发布历史记录
 */
export interface IPublishHistory {
  id: number;
  filePath: string;
  contentHash: string;
  sourceType: PublishContentType;
  /** 迁移时无映射的历史来源会置空，仅保留行本身供远端旧文件清理 */
  sourceId: number | null;
  publishTime: number;
}

/**
 * 发布文件信息
 */
export interface IPublishFile {
  publicationEntry?: true;
  templateIdentity?: { id: string; version: string; digest: string };
  path: string;
  content: Buffer | string;
  hash: string;
  /** 本文件引用的宿主资源，使用发布根目录内的路径。 */
  dependencies?: string[];
  /** 正文以链接引用的发布图片候选，仅保留当前目标账本中已知的资源。 */
  referencedMedia?: string[];
  sourceType?: PublishContentType;
  sourceId?: number;
}
export type PublishFileDescriptor = Omit<IPublishFile, "content">;

/**
 * 发布计划
 */
export interface IPublishPlan {
  imageWarnings?: PublishImageWarning[];
  releaseState?: PublishReleaseState;
  toUpload: IPublishFile[];
  toDelete: string[];
  unchanged: string[];
  virtualProcessed?: number;
}

export interface PublishedRelease {
  hashes: Record<string, string>;
  data: Record<string, { type: string; path: string; dependencies: string[] }>;
  shared: string[];
  assets: string[];
  templates: NonNullable<IPublishFile["templateIdentity"]>[];
}
export interface PublishReleaseState {
  version: 1;
  current: PublishedRelease;
  previous?: PublishedRelease;
  published: Record<string, string>;
  pending?: Record<string, string>;
}

/**
 * 发布计划预览：只含路径，不回传文件内容
 */
export interface IPublishPlanPreview {
  warnings?: string[];
  imageWarnings?: PublishImageWarning[];
  toUpload: string[];
  toDelete: string[];
}

import type { ContentRef } from "@tau/plugins/publish-data";

export interface IPublishCardListItem {
  id: number;
  summary: string;
  target: ContentRef;
  createTime: number;
}

export interface IPublishCardTagTree {
  tag: string;
  count: number;
  cards: IPublishCardListItem[];
  children?: IPublishCardTagTree[];
}

export interface IPublishListItem {
  id: number;
  title?: string;
  summary: string;
  target: ContentRef;
  tags: string[];
  createTime: number;
}

export interface IPublishDocCollectionItem {
  id: number;
  title: string;
  target: ContentRef;
  kind: "project";
}

export interface IPublishDocCollection {
  type: "project";
  label: string;
  items: IPublishDocCollectionItem[];
}

export type IPublishContentLinkTarget = ContentRef;

export interface IPublishFaviconConfig {
  cachePath: string;
  fileName: string;
  format: "svg" | "png" | "ico";
  updatedAt: number;
}

export interface IPublishAppearanceSettings {
  appearance?: {
    image?: {
      borderRadius?: import("@tau/editor/extensions/media/types").ImageBorderRadiusPreset;
      shadow?: import("@tau/editor/extensions/media/types").ImageShadowPreset;
    };
  };
}

/**
 * 上传结果
 */
export interface IUploadResult {
  success: boolean;
  path: string;
  error?: string;
}

/**
 * 发布结果
 */
export interface IPublishResult {
  imageWarnings?: PublishImageWarning[];
  success: boolean;
  uploaded: string[];
  deleted: string[];
  failed: { path: string; error: string }[];
  skipped: string[];
}

export interface PublishImageWarning {
  content: ContentRef;
  title: string;
  url: string;
  reason: string;
}

export interface PublishExportResult {
  files: string[];
  imageWarnings: PublishImageWarning[];
}

/**
 * 发布进度回调
 */
export interface IPublishProgress {
  phase: "preparing" | "uploading" | "pushing" | "deleting" | "finishing";
  current: number;
  total: number;
  currentFile?: string;
}
