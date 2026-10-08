import { invoke } from "@/electron";
import type {
  DocTaskContentStatus,
  DocTaskItem,
  DocTaskPromoteResult,
  DocTaskSnapshot,
  DocTaskToggleResult,
} from "@/types/doc-tasks";
import { withModule } from "./module-init";

/** 文档待办快照：各文档计数 + 全部未完成条目 */
export function getDocTaskSnapshot() {
  return withModule("doc-tasks", () => invoke<DocTaskSnapshot>("doc-tasks:snapshot"));
}

/** 一篇文档的全部条目（含已完成） */
export function getDocTasksOf(contentId: number) {
  return withModule("doc-tasks", () => invoke<DocTaskItem[]>("doc-tasks:of-content", contentId));
}

/** 勾选 / 取消勾选，写回原文 */
export function toggleDocTask(contentId: number, taskId: string, checked: boolean) {
  return withModule("doc-tasks", () =>
    invoke<DocTaskToggleResult>("doc-tasks:toggle", contentId, taskId, checked)
  );
}

/** 编辑器底部状态条：是否排除、未完成数 */
export function getDocTaskContentStatus(contentId: number) {
  return withModule("doc-tasks", () =>
    invoke<DocTaskContentStatus>("doc-tasks:content-status", contentId)
  );
}

/** 本文不收集 / 恢复收集 */
export function setDocTasksExcluded(contentId: number, excluded: boolean) {
  return withModule("doc-tasks", () => invoke<void>("doc-tasks:set-excluded", contentId, excluded));
}

/** 转为独立待办：原文没写 #项目 时归入 fallbackGroupId */
export function promoteDocTask(contentId: number, taskId: string, fallbackGroupId: number | null) {
  return withModule("doc-tasks", () =>
    invoke<DocTaskPromoteResult>("doc-tasks:promote", contentId, taskId, fallbackGroupId)
  );
}
