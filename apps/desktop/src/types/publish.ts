/**
 * 发布内容类型
 */
export type PublishContentType = "card" | "article" | "project" | "document";

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
  sourceId: number;
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

export interface IPublishDocCollectionItem {
  id: number;
  title: string;
  href: string;
  kind: "project" | "document";
  active?: boolean;
}

export interface IPublishDocCollection {
  type: "project" | "document";
  label: string;
  items: IPublishDocCollectionItem[];
}

export interface IPublishContentLinkTarget {
  contentType: string;
  refId: number;
  href: string;
  title?: string;
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
  content: Record<string, unknown>;
  meta: {
    type: "home" | "card" | "article" | "doc" | "list";
    publishTime: number;
  };
}
