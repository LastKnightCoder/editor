import { useEffect } from "react";
import type { ReminderOpenTarget } from "@tau/shared/reminders";
import { toast } from "@tau/ui";
import { locateEntity } from "@/commands/entity";
import { off, on } from "@/electron";
import { normalizeEntityRefKind } from "@/entity/ref";
import { bindDatabaseCommands } from "@/services/command-context";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import useSettingStore from "@/stores/useSettingStore";

async function openReminder(target: ReminderOpenTarget, signal: AbortSignal) {
  const { databaseName } = target;
  const checkDatabase = () => {
    signal.throwIfAborted();
    const active = useSettingStore.getState().setting.database.active;
    if (active.replace(/\.db$/, "") !== databaseName.replace(/\.db$/, ""))
      throw new Error("提醒来自其他资料库，请切回后重试");
  };
  checkDatabase();
  if ("page" in target) {
    openPage(target.page, target.params);
    return;
  }
  const { contentId, taskId } = target.documentTask;
  const commands = bindDatabaseCommands({ locateEntity }, { databaseName, signal });
  const location = await commands.locateEntity({ contentId });
  checkDatabase();
  const kind = location && normalizeEntityRefKind(location.kind);
  if (!location || !kind) throw new Error("找不到待办所在的原文");
  await openEntity({ kind, id: location.id }, { at: { taskId } });
}

/** 打开提醒对应的待办、日程或正文位置 */
export function useReminderOpen() {
  useEffect(() => {
    const controller = new AbortController();
    const handler = (_event: unknown, target: ReminderOpenTarget) => {
      void openReminder(target, controller.signal).catch(error => {
        if (!controller.signal.aborted)
          toast.error(error instanceof Error ? error.message : "打开提醒失败");
      });
    };
    on("reminder:open", handler);
    return () => {
      controller.abort();
      off("reminder:open", handler);
    };
  }, []);
}
