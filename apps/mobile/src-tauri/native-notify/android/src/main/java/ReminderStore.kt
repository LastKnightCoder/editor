package app.tauri.local_notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/** 一条已排期的系统提醒；key 形如 `todo:12:900000`，owner 形如 `todo:12` */
data class ReminderEntry(
  val key: String,
  val owner: String,
  val kind: String,
  val ownerId: Long,
  val title: String,
  val body: String,
  /** 不含倒计时的时间描述（「18:00 截止」），稍后提醒时用来重写正文 */
  val detail: String,
  /** 通知按钮：complete =「完成 / 稍后」，ack =「知道了 / 稍后」，none = 无按钮 */
  val actions: String,
  val at: Long
) {
  fun toJson(): JSONObject = JSONObject()
    .put("key", key).put("owner", owner).put("kind", kind).put("ownerId", ownerId)
    .put("title", title).put("body", body).put("detail", detail).put("actions", actions)
    .put("at", at)

  companion object {
    fun fromJson(json: JSONObject) = ReminderEntry(
      json.getString("key"), json.getString("owner"), json.getString("kind"),
      json.getLong("ownerId"), json.getString("title"), json.getString("body"),
      json.optString("detail", ""),
      json.optString("actions", if (json.getString("kind") == "todo") "complete" else "ack"),
      json.getLong("at")
    )
  }
}

/**
 * 排期表与待处理动作都存 SharedPreferences：AlarmManager 闹钟重启即失效，
 * 开机广播据此重排；通知按钮在 App 未运行时点击，动作排队等 App 打开后由前端落库。
 */
object ReminderStore {
  private const val PREFS = "tau_local_notify"
  private const val KEY_ENTRIES = "entries"
  private const val KEY_ACTIONS = "actions"
  private const val KEY_SHOWN = "shown"
  private const val KEY_SNOOZE = "snooze_minutes"
  private const val SHOWN_LIMIT = 20
  const val CHANNEL_TODO = "tau_todo_reminders"
  const val CHANNEL_EVENT = "tau_event_reminders"
  const val CHANNEL_POMODORO = "tau_pomodoro"
  const val EXTRA_KEY = "tau_reminder_key"
  const val EXTRA_ACTION = "tau_reminder_action"
  const val EXTRA_OWNER = "tau_reminder_owner"
  const val ACTION_TAP = "tap"
  const val ACTION_DONE = "done"
  const val ACTION_SNOOZE = "snooze"
  const val ACTION_ACK = "ack"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** 「稍后提醒」间隔（分钟），由前端随排期写入；原生按钮在 App 未运行时也要用到 */
  fun snoozeMinutes(context: Context) = prefs(context).getInt(KEY_SNOOZE, 10)

  fun setSnoozeMinutes(context: Context, minutes: Int) {
    prefs(context).edit().putInt(KEY_SNOOZE, minutes.coerceIn(1, 120)).apply()
  }

  @Synchronized
  fun entries(context: Context): MutableMap<String, ReminderEntry> {
    val raw = prefs(context).getString(KEY_ENTRIES, "[]") ?: "[]"
    val result = LinkedHashMap<String, ReminderEntry>()
    try {
      val array = JSONArray(raw)
      for (i in 0 until array.length()) {
        val entry = ReminderEntry.fromJson(array.getJSONObject(i))
        result[entry.key] = entry
      }
    } catch (_: Exception) {
    }
    return result
  }

  @Synchronized
  fun save(context: Context, entries: Map<String, ReminderEntry>) {
    val array = JSONArray()
    entries.values.forEach { array.put(it.toJson()) }
    prefs(context).edit().putString(KEY_ENTRIES, array.toString()).apply()
  }

  /** 已送达的提醒留底（有上限）：通知按钮「稍后」需要原条目，进程可能已被回收 */
  @Synchronized
  fun remember(context: Context, entry: ReminderEntry) {
    val array = JSONArray(prefs(context).getString(KEY_SHOWN, "[]") ?: "[]")
    val kept = JSONArray()
    for (i in 0 until array.length()) {
      val item = array.getJSONObject(i)
      if (item.optString("key") != entry.key) kept.put(item)
    }
    kept.put(entry.toJson())
    val start = maxOf(0, kept.length() - SHOWN_LIMIT)
    val trimmed = JSONArray()
    for (i in start until kept.length()) trimmed.put(kept.getJSONObject(i))
    prefs(context).edit().putString(KEY_SHOWN, trimmed.toString()).apply()
  }

  @Synchronized
  fun recall(context: Context, key: String): ReminderEntry? {
    val array = JSONArray(prefs(context).getString(KEY_SHOWN, "[]") ?: "[]")
    for (i in array.length() - 1 downTo 0) {
      val item = array.getJSONObject(i)
      if (item.optString("key") == key) return ReminderEntry.fromJson(item)
    }
    return null
  }

  @Synchronized
  fun pushAction(context: Context, action: JSONObject) {
    val array = JSONArray(prefs(context).getString(KEY_ACTIONS, "[]") ?: "[]")
    array.put(action)
    prefs(context).edit().putString(KEY_ACTIONS, array.toString()).apply()
  }

  @Synchronized
  fun takeActions(context: Context): JSONArray {
    val array = JSONArray(prefs(context).getString(KEY_ACTIONS, "[]") ?: "[]")
    prefs(context).edit().putString(KEY_ACTIONS, "[]").apply()
    return array
  }

  /** 通知 id 取 key 的稳定哈希；同一提醒重排覆盖旧闹钟与旧通知 */
  fun notificationId(key: String) = key.hashCode()

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_TODO, "待办提醒", NotificationManager.IMPORTANCE_HIGH)
        .apply { description = "截止任务到点前提醒" }
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_EVENT, "日程提醒", NotificationManager.IMPORTANCE_HIGH)
        .apply { description = "日程开始前提醒" }
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_POMODORO, "番茄专注", NotificationManager.IMPORTANCE_HIGH)
        .apply { description = "倒计时专注结束" }
    )
  }

  private fun alarmIntent(context: Context, key: String): PendingIntent {
    val intent = Intent(context, ReminderAlarmReceiver::class.java).putExtra(EXTRA_KEY, key)
    return PendingIntent.getBroadcast(
      context, notificationId(key), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun canExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
  }

  /** 有准点权限用 setExactAndAllowWhileIdle，否则退回系统可延后的 setAndAllowWhileIdle */
  fun arm(context: Context, entry: ReminderEntry) {
    val manager = context.getSystemService(AlarmManager::class.java)
    val pending = alarmIntent(context, entry.key)
    if (canExact(context)) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.at, pending)
    else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.at, pending)
  }

  fun disarm(context: Context, key: String) {
    context.getSystemService(AlarmManager::class.java).cancel(alarmIntent(context, key))
  }

  fun rearmAll(context: Context) {
    val now = System.currentTimeMillis()
    val entries = entries(context)
    val expired = entries.values.filter { it.at <= now - 60_000 }.map { it.key }
    expired.forEach { entries.remove(it) }
    save(context, entries)
    entries.values.forEach { arm(context, it) }
  }

  private fun actionIntent(context: Context, entry: ReminderEntry, action: String): PendingIntent {
    val intent = Intent(context, ReminderActionReceiver::class.java)
      .putExtra(EXTRA_KEY, entry.key).putExtra(EXTRA_ACTION, action)
    return PendingIntent.getBroadcast(
      context, (entry.key + action).hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** 点通知本体 / 「完成」：拉起应用主界面，带上 key 与动作交给插件转发给前端落库 */
  private fun launchIntent(context: Context, entry: ReminderEntry, action: String): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .putExtra(EXTRA_KEY, entry.key).putExtra(EXTRA_ACTION, action).putExtra(EXTRA_OWNER, entry.owner)
    return PendingIntent.getActivity(
      context, (entry.key + action).hashCode(), launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun show(context: Context, entry: ReminderEntry) {
    ensureChannels(context)
    remember(context, entry)
    val (channel, label, category) = when (entry.kind) {
      "event" -> Triple(CHANNEL_EVENT, "日程", NotificationCompat.CATEGORY_EVENT)
      "pomodoro" -> Triple(CHANNEL_POMODORO, "番茄专注", NotificationCompat.CATEGORY_ALARM)
      else -> Triple(CHANNEL_TODO, "待办", NotificationCompat.CATEGORY_REMINDER)
    }
    val builder = NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.drawable.ic_stat_tau)
      .setContentTitle(entry.title)
      .setContentText(entry.body)
      .setSubText(label)
      .setCategory(category)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setWhen(entry.at)
      .setShowWhen(true)
    when (entry.actions) {
      "complete" -> launchIntent(context, entry, ACTION_DONE)?.let { builder.addAction(0, "完成", it) }
      "ack" -> builder.addAction(0, "知道了", actionIntent(context, entry, ACTION_ACK))
    }
    if (entry.actions != "none") {
      builder.addAction(0, "${snoozeMinutes(context)} 分钟后", actionIntent(context, entry, ACTION_SNOOZE))
    }
    launchIntent(context, entry, ACTION_TAP)?.let { builder.setContentIntent(it) }
    try {
      NotificationManagerCompat.from(context).notify(notificationId(entry.key), builder.build())
    } catch (_: SecurityException) {
      // 用户关掉了通知权限：静默放弃，设置页会提示
    }
  }
}
