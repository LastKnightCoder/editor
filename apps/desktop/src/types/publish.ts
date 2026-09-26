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
  path: string;
  content: Buffer | string;
  hash: string;
  sourceType?: PublishContentType;
  sourceId?: number;
}

/**
 * 发布计划
 */
export interface IPublishPlan {
  toUpload: IPublishFile[];
  toDelete: string[];
  unchanged: string[];
  virtualProcessed?: number;
}

/**
 * 发布计划预览：只含路径，不回传文件内容
 */
export interface IPublishPlanPreview {
  toUpload: string[];
  toDelete: string[];
}

export interface IPublishCardListItem {
  id: number;
  summary: string;
  href: string;
  category: "temporary" | "permanent" | "theme" | "literature";
  createTime: number;
}

export interface IPublishCardTagTree {
  tag: string;
  count: number;
  cards: IPublishCardListItem[];
  children?: IPublishCardTagTree[];
}

export interface IPublishArticleListItem {
  id: number;
  title: string;
  href: string;
  createTime: number;
}

export interface IPublishListItem {
  id: number;
  title?: string;
  summary: string;
  href: string;
  tags: string[];
  createTime: number;
}

export type IPublishQuestStatus = "not_started" | "in_progress" | "resolved";

export interface IPublishQuestListItem {
  id: number;
  title: string;
  summary: string;
  href: string;
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
  href: string;
  kind: "project";
  active?: boolean;
}

export interface IPublishDocCollection {
  type: "project";
  label: string;
  items: IPublishDocCollectionItem[];
}

export interface IPublishContentLinkTarget {
  contentType: string;
  refId: number;
  href: string;
  title?: string;
}

export type IPublishSearchItemType = "card" | "article" | "project-doc" | "quest";

export interface IPublishSearchItem {
  id: number;
  type: IPublishSearchItemType;
  typeLabel: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  href: string;
  createTime: number;
  updateTime: number;
}

export interface IPublishSearchIndexPayload {
  version: 1;
  generatedAt: number;
  options: Record<string, unknown>;
  items: IPublishSearchItem[];
  index: unknown;
}

export interface IPublishFaviconConfig {
  cachePath: string;
  fileName: string;
  format: "svg" | "png" | "ico";
  updatedAt: number;
}

export interface IPublishAppearanceSettings {
  appearance?: {
    image?: {
      borderRadius?: import("@tau/editor/src/types").ImageBorderRadiusPreset;
      shadow?: import("@tau/editor/src/types").ImageShadowPreset | boolean;
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
 * 初始化数据结构（用于模板注入）
 */
export interface IPublishInitData {
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
  navigation: Array<{ label: string; href: string }>;
  cardTagTree?: IPublishCardTagTree[];
  activeTag?: string;
  articleList?: IPublishArticleListItem[];
  cardList?: IPublishCardListItem[];
  sidebar?: Array<{
    title: string;
    href?: string;
    children?: Array<{
      title: string;
      href?: string;
    }>;
  }>;
  docCollections?: IPublishDocCollection[];
  contentLinkTargets?: Record<string, IPublishContentLinkTarget>;
  search?: {
    href: string;
  };
  settings?: IPublishAppearanceSettings;
  content: Record<string, unknown>;
  meta: {
    type: "home" | "card" | "article" | "doc" | "list" | "quest";
    publishTime: number;
  };
}
