/**
 * 会影响提醒排期的写命令：命令完成后通知排期器重排（排期器自行合并抖动）。
 * 正文保存与插件提交待办修改也会改变排期。
 */
const WRITE =
  /^(todo_(?!list|get)|calendar_event_(create|update|delete)|reminder_set$|plugin_tasks_write$|pomodoro_(start|pause|resume|stop)_session$|update_content$|set_active_database$|sync_download_database$)/;

const listeners = new Set<() => void>();

export function publishReminderChange() {
  for (const listener of listeners) listener();
}

export function notifyReminderSourceChanged(command: string) {
  if (WRITE.test(command)) publishReminderChange();
}

export function onReminderSourceChanged(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
