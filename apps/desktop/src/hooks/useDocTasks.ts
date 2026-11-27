/**
 * 文档待办数据（待办页与编辑器状态条共用）：读主进程 doc-tasks 镜像。
 * 主进程在正文、项目或设置变化后广播 doc-tasks:changed，按库失效。
 * 勾选乐观更新：先从快照移除 / 放回该条，再写回原文；失败回滚并提示。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import {
  getDocTaskContentStatus,
  getDocTaskSnapshot,
  getDocTasksOf,
  promoteDocTask,
  readDocTaskReminders,
  setDocTaskReminders,
  setDocTasksExcluded,
  toggleDocTask,
} from "@/commands/doc-tasks";
import { getReminderTranslator } from "@tau/shared/reminders";
import { desktopI18n } from "@/app/i18n/runtime";
import type { TaskReminder } from "@tau/shared/task-assistant";
import { on } from "@/electron";
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import { useHooksFeedbackI18n } from "@/hooks/i18n";
import type { DocTaskItem, DocTaskSnapshot } from "@/types/doc-tasks";

const databaseId = (database: string) => database.replace(/\.db$/, "");

const docTaskKeys = {
  root: (database: string) => ["doc-tasks", databaseId(database)] as const,
  snapshot: (database: string) => [...docTaskKeys.root(database), "snapshot"] as const,
  of: (database: string, contentId: number) =>
    [...docTaskKeys.root(database), "content", contentId] as const,
  status: (database: string, contentId: number) =>
    [...docTaskKeys.root(database), "status", contentId] as const,
  reminders: (database: string, contentId: number, taskId: string) =>
    [...docTaskKeys.root(database), "reminders", contentId, taskId] as const,
};

on("doc-tasks:changed", (_event, { databaseName }: { databaseName: string }) => {
  void queryClient.invalidateQueries({ queryKey: docTaskKeys.root(databaseName) });
});

const useActiveDatabase = () => useSettingStore(state => state.setting.database.active);

export function useDocTaskSnapshot() {
  const database = useActiveDatabase();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: docTaskKeys.snapshot(database),
    queryFn: () => getDocTaskSnapshot(database),
    enabled: connected,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return { snapshot: query.data ?? null, loading: query.isPending };
}

/** 一篇文档的全部条目（含已完成），展开「已完成」或打开抽屉时才取 */
export function useDocTasksOf(contentId: number | null) {
  const database = useActiveDatabase();
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: docTaskKeys.of(database, contentId ?? 0),
    queryFn: () => getDocTasksOf(contentId ?? 0, database),
    enabled: connected && contentId != null,
    staleTime: 30_000,
  });
}

export function useToggleDocTask() {
  const client = useQueryClient();
  const database = useActiveDatabase();
  const { t } = useHooksFeedbackI18n();
  return async (task: DocTaskItem, checked: boolean, sourceTitle: string) => {
    const key = docTaskKeys.snapshot(database);
    const previous = client.getQueryData<DocTaskSnapshot>(key);
    if (previous)
      client.setQueryData<DocTaskSnapshot>(key, {
        sources: previous.sources.map(s =>
          s.contentId === task.contentId
            ? {
                ...s,
                openCount: s.openCount + (checked ? -1 : 1),
                doneCount: s.doneCount + (checked ? 1 : -1),
              }
            : s
        ),
        open: checked
          ? previous.open.filter(t => !(t.contentId === task.contentId && t.taskId === task.taskId))
          : [...previous.open, { ...task, checked: false }].sort(
              (a, b) => a.contentId - b.contentId || a.sortIndex - b.sortIndex
            ),
      });
    const rollback = () => previous && client.setQueryData(key, previous);
    try {
      const result = await toggleDocTask(task.contentId, task.taskId, checked, database);
      if (result === "readonly") {
        rollback();
        toast.info(t("docTasks.readonlyHint"));
        return;
      }
      if (result === "not-found") {
        rollback();
        toast.info(t("docTasks.missingRefreshed"));
        return;
      }
      if (result === "busy") {
        rollback();
        toast.info(t("docTasks.busyRetry"));
        return;
      }
      if (checked)
        if (useSettingStore.getState().setting.database.active === database)
          toast.success(t("docTasks.checkedIn", { title: sourceTitle }), {
            action: {
              label: t("docTasks.undo"),
              onClick: () =>
                void toggleDocTask(task.contentId, task.taskId, false, database)
                  .then(result => {
                    if (result !== "ok") toast.info(t("docTasks.undoBusy"));
                  })
                  .catch(error =>
                    toast.error(error instanceof Error ? error.message : t("docTasks.undoFailed"))
                  ),
            },
          });
    } catch {
      rollback();
      toast.error(t("docTasks.writeFailed"));
    } finally {
      void client.invalidateQueries({ queryKey: docTaskKeys.root(database) });
    }
  };
}

/** 编辑器底部状态条用：这篇有几项未完成、是否被排除；没有勾选项时 openCount 为 0 */
export function useDocTaskContentStatus(contentId: number | undefined) {
  const database = useActiveDatabase();
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: docTaskKeys.status(database, contentId ?? 0),
    queryFn: () => getDocTaskContentStatus(contentId ?? 0, database),
    enabled: connected && contentId != null && contentId > 0,
    staleTime: 10_000,
  });
}

export function useSetDocTasksExcluded() {
  const client = useQueryClient();
  const database = useActiveDatabase();
  return async (contentId: number, excluded: boolean) => {
    try {
      await setDocTasksExcluded(contentId, excluded, database);
      await client.invalidateQueries({ queryKey: docTaskKeys.root(database) });
      return useSettingStore.getState().setting.database.active === database;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收集设置保存失败");
      return false;
    }
  };
}

/** 转为独立待办；成功后通知待办快照刷新，返回新待办 id（失败返回 null 并提示） */
export function usePromoteDocTask() {
  const client = useQueryClient();
  const database = useActiveDatabase();
  return async (task: DocTaskItem, fallbackGroupId: number | null) => {
    try {
      const result = await promoteDocTask(task.contentId, task.taskId, fallbackGroupId, database);
      await client.invalidateQueries({ queryKey: docTaskKeys.root(database) });
      if (!result.ok) {
        toast.info(
          result.reason === "no-group" ? "先建一个项目，或在原文里写 #项目名" : "原文中已没有这一项"
        );
        return null;
      }
      if (useSettingStore.getState().setting.database.active !== database) return null;
      emitTodoMutation({
        source: "doc-tasks",
        entityType: "item",
        action: TODO_MUTATION_ACTIONS.CREATE_ITEM,
        entityId: result.todoId,
      });
      return result.todoId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "转为独立待办失败");
      return null;
    }
  };
}

/** 读取单条文档勾选项的最新提醒与并发指纹（抽屉打开时拉取，随 doc-tasks:changed 失效） */
export function useDocTaskReminders(contentId: number | null, taskId: string | null) {
  const database = useActiveDatabase();
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: docTaskKeys.reminders(database, contentId ?? 0, taskId ?? ""),
    queryFn: () => readDocTaskReminders(contentId ?? 0, taskId ?? "", database),
    enabled: connected && contentId != null && contentId > 0 && Boolean(taskId),
    staleTime: 0,
  });
}

/** 条件写回单条文档勾选项提醒，冲突或只读时不覆盖新值并给出明确提示 */
export function useSetDocTaskReminders() {
  const client = useQueryClient();
  const database = useActiveDatabase();
  return async (
    contentId: number,
    taskId: string,
    reminders: readonly TaskReminder[],
    expectedDigest: string
  ) => {
    const tr = getReminderTranslator(desktopI18n.getSnapshot()).t;
    try {
      const result = await setDocTaskReminders(
        contentId,
        taskId,
        reminders,
        expectedDigest,
        database
      );
      if (result === "conflict") toast.info(tr("ui.conflict"));
      else if (result === "unavailable") toast.info(tr("ui.unavailable"));
      else if (result === "readonly") toast.info(tr("ui.readonly"));
      else if (result === "busy") toast.info(tr("ui.busy"));
      else if (result === "not-found") toast.info(tr("ui.missing"));
      return result;
    } catch {
      toast.error(tr("ui.saveFailed"));
      return "error" as const;
    } finally {
      void client.invalidateQueries({ queryKey: docTaskKeys.root(database) });
    }
  };
}
