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
  phase: "preparing" | "uploading" | "deleting" | "finishing";
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
  sidebar?: Array<{
    title: string;
    href?: string;
    children?: Array<{
      title: string;
      href?: string;
    }>;
  }>;
  content: Record<string, unknown>;
  meta: {
    type: "home" | "card" | "article" | "doc" | "list";
    publishTime: number;
  };
}
