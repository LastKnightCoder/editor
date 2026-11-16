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

// ============ 发布历史相关 ============

/**
 * 获取发布历史
 */
export async function getPublishHistory(): Promise<IPublishHistory[]> {
  return invoke("get-publish-history");
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
