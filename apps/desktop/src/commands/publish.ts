import { invoke } from "@/electron";
import { ensureModule } from "./module-init";
import { getContentPluginPublishContext } from "@/app/plugins/content-plugin-state";
import {
  IPublishSelection,
  IPublishHistory,
  IPublishPlanPreview,
  IPublishResult,
  IPublishAppearanceSettings,
  PublishContentType,
  PublishExportResult,
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
  contentType: PublishContentType
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
  }>
): Promise<void> {
  return invoke("batch-upsert-publish-selections", items);
}

/**
 * 删除发布选择
 */
export async function deletePublishSelection(
  contentType: PublishContentType,
  contentId: number
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
export async function getPublishHistoryByPath(filePath: string): Promise<IPublishHistory | null> {
  return invoke("get-publish-history-by-path", filePath);
}

/**
 * 清空发布历史
 */
export async function clearPublishHistory(): Promise<void> {
  return invoke("clear-publish-history");
}

// ============ 发布操作相关 ============

export async function listPublishTemplates(): Promise<
  import("@tau/plugins/template").TemplateManifest[]
> {
  await ensureModule("publish");
  return invoke("list-publish-templates");
}

export async function exportPublishOutput(options: {
  targetDir: string;
  basePath?: string;
  siteConfig: import("@/types/publish").PublishSiteConfig;
  settings?: IPublishAppearanceSettings;
}): Promise<PublishExportResult> {
  await ensureModule("publish");
  return invoke("export-publish-output", {
    ...options,
    editorContext: getContentPluginPublishContext(),
  });
}
export async function previewPublishPlan(
  config: import("@/types/publish").PublishRequest
): Promise<IPublishPlanPreview> {
  await ensureModule("publish");
  return invoke("preview-publish-plan", {
    ...config,
    editorContext: getContentPluginPublishContext(),
  });
}
export async function executePublish(
  config: import("@/types/publish").PublishRequest
): Promise<IPublishResult> {
  await ensureModule("publish");
  return invoke("execute-publish", { ...config, editorContext: getContentPluginPublishContext() });
}
export async function describePublishTarget(
  config: import("@/types/publish").PublishRequest
): Promise<{ basePath: string; publicUrl?: string }> {
  await ensureModule("publish");
  return invoke("describe-publish-target", config);
}
export async function checkPublishConnection(
  config: import("@/types/publish").PublishRequest
): Promise<boolean> {
  await ensureModule("publish");
  return invoke("check-publish-connection", config);
}
export async function savePublishPluginConfig(
  id: string,
  value: import("@tau/plugins").JsonValue
): Promise<void> {
  await ensureModule("plugin-local");
  return window.electron.invoke("plugin-local:publish-config", id, value);
}
