// entity_refs 索引的移动端重建编排：解析器与桌面端同一份（@tau/shared/inline-refs，
// 口径零漂移），Rust 只负责对账（entity_refs_pending）与事务写入（entity_refs_apply）。
// 触发：启动对账一次 + 监听主进程 reconcile 就绪事件（覆盖正文保存、同步下载、切库），
// 事件到后防抖合并，避免连续保存触发多轮。

import { listen } from "@tauri-apps/api/event";
import { extractInlineRefs } from "@tau/shared/inline-refs";
import * as tauri from "../../services/tauri";

const BATCH = 50;
const REBUILD_DEBOUNCE_MS = 2000;
/** 防御性上限：极端脏库时避免无限循环（正常一轮 50 条 × 数十轮内收敛） */
const MAX_ROUNDS = 400;

let running = false;
let rerun = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function parseRefs(contentJson: string | null) {
  if (!contentJson) return [];
  try {
    return extractInlineRefs(JSON.parse(contentJson)).map(ref => ({
      dstKind: ref.dst.kind,
      dstId: ref.dst.id,
      dstContentId: ref.dstContentId,
      snippetBefore: ref.snippet.before,
      snippetLabel: ref.snippet.label,
      snippetAfter: ref.snippet.after,
      srcBlock: ref.blockIndex,
    }));
  } catch {
    return [];
  }
}

export async function rebuildEntityRefs(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const batch = await tauri.entityRefsPending(BATCH);
      if (batch.pending.length === 0 && batch.removed.length === 0) break;
      const applied = batch.pending.map(item => ({
        contentId: item.contentId,
        updateTime: item.updateTime,
        refs: parseRefs(item.content),
      }));
      await tauri.entityRefsApply({ applied, removed: batch.removed });
      // removed 随首轮全量清除，pending 不足一批即对账完成
      if (batch.pending.length < BATCH) break;
    }
  } catch (error) {
    console.warn("[entity-refs] 重建失败，将在下次触发时重试", error);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      void rebuildEntityRefs();
    }
  }
}

function scheduleRebuild() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void rebuildEntityRefs();
  }, REBUILD_DEBOUNCE_MS);
}

/** App 挂载时调用一次；返回清理函数 */
export function setupEntityRefsRebuild(): () => void {
  void rebuildEntityRefs();
  const listener = listen("entity-refs:rebuild", scheduleRebuild);
  return () => {
    void listener.then(unlisten => unlisten());
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };
}
