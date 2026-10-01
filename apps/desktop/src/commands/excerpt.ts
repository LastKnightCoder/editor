import { invoke } from "@/electron";
import type { ExcerptSyncResult } from "@/entity/excerpt/types";

/** 浏览器插件一页划线的快照写入当前库（主进程校验参数并按页 diff） */
export const syncExcerptWebPage = async (payload: unknown): Promise<ExcerptSyncResult> => {
  return await invoke("excerpt:sync-web-page", payload);
};
