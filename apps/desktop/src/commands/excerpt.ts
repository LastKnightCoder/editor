import { invoke } from "@/electron";
import type { Excerpt, ExcerptSourceType, ExcerptSyncResult } from "@/entity/excerpt/types";

/** 浏览器插件一页划线的快照写入当前库（主进程校验参数并按页 diff） */
export const syncExcerptWebPage = async (payload: unknown): Promise<ExcerptSyncResult> => {
  return await invoke("excerpt:sync-web-page", payload);
};

/** 按外部 id 找摘录，按候选顺序返回第一个命中的 */
export const findExcerptByExternal = async (
  sourceType: ExcerptSourceType,
  externalIds: string[]
): Promise<Excerpt | null> => {
  return await invoke("excerpt:find-by-external", sourceType, externalIds);
};
