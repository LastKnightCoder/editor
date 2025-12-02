import { invoke } from "@/electron";
import {
  IPublishSelection,
  IPublishHistory,
  IPublishPlan,
  IPublishResult,
  IPublishFile,
  PublishContentType,
} from "@/types/publish";

// ============ 发布选择相关 ============

/**
 * 获取所有已选择的发布内容
 */
export async function getPublishSelections(): Promise<IPublishSelection[]> {
  return invoke("get-publish-selections");
}

/**
 * 按类型获取发布选择
 */
export async function getPublishSelectionsByType(
  contentType: PublishContentType,
): Promise<IPublishSelection[]> {
  return invoke("get-publish-selections-by-type", contentType);
}

/**
 * 更新或插入发布选择
 */
export async function upsertPublishSelection(data: {
  contentType: PublishContentType;
  contentId: number;
  parentPath?: string;
  selected?: boolean;
}): Promise<IPublishSelection> {
  return invoke("upsert-publish-selection", data);
}

/**
 * 批量更新发布选择
 */
export async function batchUpsertPublishSelections(
  items: Array<{
    contentType: PublishContentType;
    contentId: number;
    parentPath?: string;
    selected?: boolean;
  }>,
): Promise<void> {
  return invoke("batch-upsert-publish-selections", items);
}

/**
 * 删除发布选择
 */
export async function deletePublishSelection(
  contentType: PublishContentType,
  contentId: number,
): Promise<boolean> {
  return invoke("delete-publish-selection", contentType, contentId);
}

/**
 * 清空所有发布选择
 */
export async function clearPublishSelections(): Promise<void> {
  return invoke("clear-publish-selections");
}

// ============ 发布历史相关 ============

/**
 * 获取发布历史
 */
export async function getPublishHistory(): Promise<IPublishHistory[]> {
  return invoke("get-publish-history");
}

/**
 * 根据路径获取发布历史
 */
export async function getPublishHistoryByPath(
  filePath: string,
): Promise<IPublishHistory | null> {
  return invoke("get-publish-history-by-path", filePath);
}

/**
 * 清空发布历史
 */
export async function clearPublishHistory(): Promise<void> {
  return invoke("clear-publish-history");
}

// ============ 发布操作相关 ============

/**
 * 下载发布模板
 */
export async function downloadPublishTemplate(): Promise<string> {
  return invoke("download-publish-template");
}

/**
 * 预览发布计划
 */
export async function previewPublishPlan(): Promise<IPublishPlan> {
  return invoke("preview-publish-plan");
}

/**
 * 执行发布
 */
export async function executePublish(config: {
  providerType: "github" | "s3";
  providerConfig: Record<string, unknown>;
  siteConfig: { title: string; description: string };
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    concurrency?: number;
  };
}): Promise<IPublishResult> {
  return invoke("execute-publish", config);
}

/**
 * 重试发布失败的文件
 */
export async function retryPublishFiles(config: {
  providerType: "github" | "s3";
  providerConfig: Record<string, unknown>;
  files: IPublishFile[];
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    concurrency?: number;
  };
}): Promise<IPublishResult> {
  return invoke("retry-publish-files", config);
}

/**
 * 检查发布连接
 */
export async function checkPublishConnection(config: {
  providerType: "github" | "s3";
  providerConfig: Record<string, unknown>;
}): Promise<boolean> {
  return invoke("check-publish-connection", config);
}
