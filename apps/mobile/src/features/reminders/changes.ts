/**
 * 会影响提醒排期的写命令：命令完成后通知排期器重排（排期器自行合并抖动）。
 * 读命令（list / get / upcoming）不触发；正文保存（文档待办）也算；插件与 AI 的待办写入
 * 靠回到前台时的重排兜底。
 */
const WRITE =
  /^(todo_(?!list|get)|calendar_event_(create|update|delete)|reminder_set$|pomodoro_(start|pause|resume|stop)_session$|update_content$|set_active_database$|sync_download_database$)/;

const listeners = new Set<() => void>();

export function notifyReminderSourceChanged(command: string) {
  if (!WRITE.test(command)) return;
  for (const listener of listeners) listener();
}

export function onReminderSourceChanged(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
