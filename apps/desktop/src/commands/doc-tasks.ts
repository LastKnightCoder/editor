import { invoke } from "@/electron";
import type {
  DocTaskContentStatus,
  DocTaskItem,
  DocTaskPromoteResult,
  DocTaskSnapshot,
  DocTaskToggleResult,
} from "@/types/doc-tasks";
import { withModule } from "./module-init";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import type { DocTaskGroup } from "@/entity/doc-tasks";

export const getDocTaskGroups = (database?: string) =>
  request<DocTaskGroup[]>("doc-tasks:groups", [], database);

const normalizeDatabase = (name: string) => name.replace(/\.db$/, "");
function request<T>(channel: string, args: unknown[], database?: string): Promise<T> {
  const scope = currentCommandScope();
  const expected =
    database ?? scope?.databaseName ?? useSettingStore.getState().setting.database.active;
  const command = scope ? bindDatabaseCommands({ invoke }, scope) : { invoke };
  const check = () => {
    scope?.signal?.throwIfAborted();
    if (
      normalizeDatabase(useSettingStore.getState().setting.database.active) !==
      normalizeDatabase(expected)
    )
      throw new Error("数据库已切换，请重新操作");
  };
  check();
  return withModule("doc-tasks", () => {
    check();
    return command.invoke<T>(channel, ...args, { databaseName: expected });
  });
}

/** 文档待办快照：各文档计数 + 全部未完成条目 */
export function getDocTaskSnapshot(database?: string) {
  return request<DocTaskSnapshot>("doc-tasks:snapshot", [], database);
}

/** 一篇文档的全部条目（含已完成） */
export function getDocTasksOf(contentId: number, database?: string) {
  return request<DocTaskItem[]>("doc-tasks:of-content", [contentId], database);
}

/** 勾选 / 取消勾选，写回原文 */
export function toggleDocTask(
  contentId: number,
  taskId: string,
  checked: boolean,
  database?: string
) {
  return request<DocTaskToggleResult>("doc-tasks:toggle", [contentId, taskId, checked], database);
}

/** 编辑器底部状态条：是否排除、未完成数 */
export function getDocTaskContentStatus(contentId: number, database?: string) {
  return request<DocTaskContentStatus>("doc-tasks:content-status", [contentId], database);
}

/** 本文不收集 / 恢复收集 */
export function setDocTasksExcluded(contentId: number, excluded: boolean, database?: string) {
  return request<void>("doc-tasks:set-excluded", [contentId, excluded], database);
}

/** 转为独立待办：原文没写 #项目 时归入 fallbackGroupId */
export function promoteDocTask(
  contentId: number,
  taskId: string,
  fallbackGroupId: number | null,
  database?: string
) {
  return request<DocTaskPromoteResult>(
    "doc-tasks:promote",
    [contentId, taskId, fallbackGroupId],
    database
  );
}
