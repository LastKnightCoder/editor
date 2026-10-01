import type { Database } from "better-sqlite3";
import { hasExcerptChanges } from "@/entity/excerpt/types";
import WeReadConfigTable from "./weread-config";
import WeReadNotebookTable from "./weread-notebook";

/** 摘录展开规则的版本；规则变化时加一，连库时全部书重新展开一次（diff 写入，幂等） */
export const WEREAD_EXCERPT_VERSION = 1;
const EXCERPT_VERSION_KEY = "excerpt_expand_version";

/**
 * 存量回填：版本号低于当前时，把所有缓存了划线的书展开成摘录。是从已有数据填充新表、不是格式迁移，
 * 失败只记日志、下次连库重试，不阻塞开库（KL-033）。
 */
export function backfillWeReadExcerpts(db: Database): boolean {
  if ((WeReadConfigTable.getNumber(db, EXCERPT_VERSION_KEY) ?? 0) >= WEREAD_EXCERPT_VERSION) {
    return false;
  }
  const changed = db.transaction(() => {
    let dirty = false;
    for (const notebook of WeReadNotebookTable.getAllWithHighlights(db)) {
      if (hasExcerptChanges(WeReadNotebookTable.syncExcerpts(db, notebook))) dirty = true;
    }
    WeReadConfigTable.set(db, EXCERPT_VERSION_KEY, WEREAD_EXCERPT_VERSION);
    return dirty;
  })();
  return changed;
}
