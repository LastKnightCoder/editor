import { invoke } from "@/electron";
import type { Excerpt, ExcerptSourceSummary, ExcerptSyncResult } from "@/entity/excerpt/types";

/** 按外部 id 找摘录，按候选顺序返回第一个命中的 */
export const findExcerptByExternal = async (
  sourceType: string,
  externalIds: string[]
): Promise<Excerpt | null> => {
  return await invoke("excerpt:find-by-external", sourceType, externalIds);
};

/** 以下为插件摘录提供方的写入与读取；来源类型由插件宿主取插件 ID，参数在主进程校验 */
export const registerExcerptProvider = (sourceType: string, label: string): Promise<void> =>
  invoke("excerpt:register-provider", sourceType, label);

export const replaceProviderExcerpts = (
  sourceType: string,
  source: unknown,
  items: unknown
): Promise<ExcerptSyncResult> => invoke("excerpt:replace", sourceType, source, items);

export const patchProviderExcerpts = (
  sourceType: string,
  source: unknown,
  change: unknown
): Promise<ExcerptSyncResult> => invoke("excerpt:patch", sourceType, source, change);

export const listProviderExcerptSources = (sourceType: string): Promise<ExcerptSourceSummary[]> =>
  invoke("excerpt:sources", sourceType);

export const listProviderExcerpts = (sourceType: string, sourceKey: string): Promise<Excerpt[]> =>
  invoke("excerpt:items", sourceType, sourceKey);
