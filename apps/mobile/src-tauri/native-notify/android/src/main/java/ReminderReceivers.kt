package app.tauri.local_notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/** 闹钟到点：前台且开启应用内横幅时交给前端展示，否则发系统通知 */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(ReminderStore.EXTRA_KEY) ?: return
    val entries = ReminderStore.entries(context)
    val entry = entries.remove(key) ?: return
    ReminderStore.save(context, entries)
    val plugin = LocalNotifyPlugin.instance
    if (plugin != null && plugin.deliverInForeground(entry)) return
    ReminderStore.show(context, entry)
  }
}

/** 后台按钮（不拉起应用）：「稍后」原生重排，「知道了」只关掉通知 */
class ReminderActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(ReminderStore.EXTRA_KEY) ?: return
    val action = intent.getStringExtra(ReminderStore.EXTRA_ACTION) ?: return
    NotificationManagerCompat.from(context).cancel(ReminderStore.notificationId(key))
    if (action == ReminderStore.ACTION_SNOOZE) LocalNotifyPlugin.snoozeFromAction(context, key)
  }
}

/** 开机、应用更新或准点权限变化后重排闹钟 */
class ReminderBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    ReminderStore.rearmAll(context)
  }
}
