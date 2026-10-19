/**
 * 发布内容类型
 */
export type PublishContentType = "card" | "article" | "project" | "quest";

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
  sourceType?: PublishContentType;
  sourceId?: number;
}
export type PublishFileDescriptor = Omit<IPublishFile, "content">;

/**
 * 发布计划
 */
export interface IPublishPlan {
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

export type IPublishQuestStatus = "not_started" | "in_progress" | "resolved";

export interface IPublishQuestListItem {
  id: number;
  title: string;
  summary: string;
  target: ContentRef;
  tags: string[];
  groupId: number;
  groupTitle: string;
  status: IPublishQuestStatus;
  answerCount: number;
  createTime: number;
  updateTime: number;
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
  success: boolean;
  uploaded: string[];
  deleted: string[];
  failed: { path: string; error: string }[];
  skipped: string[];
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

/**
 * 宿主内部的数据装配记录；发布协议从 @tau/plugins/publish-data 消费。
 */
export interface IPublishInitData {
  pluginRenderers?: import("@tau/plugins/rendering").PublishedPluginRender[];
  site: {
    title: string;
    description: string;
    basePath: string;
    publicUrl?: string;
    favicon?: {
      href: string;
      format: IPublishFaviconConfig["format"];
      mimeType: string;
    };
  };
  cardTagTree?: IPublishCardTagTree[];
  sidebar?: import("@tau/plugins/publish-data").TreeItem[];
  docCollections?: IPublishDocCollection[];
  contentLinkTargets?: Record<string, IPublishContentLinkTarget>;
  settings?: IPublishAppearanceSettings;
  content: Record<string, unknown>;
  meta: {
    type: "home" | "card" | "article" | "doc" | "list" | "quest";
    publishTime: number;
  };
}
