package app.tauri.local_notify

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import android.webkit.WebView
import org.json.JSONObject

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class LocalNotifyPlugin(private val activity: Activity) : Plugin(activity) {
  private val main = Handler(Looper.getMainLooper())
  private var foreground = false
  private var foregroundBanner = false

  companion object {
    @Volatile
    var instance: LocalNotifyPlugin? = null

    /** 通知动作一律入队（冷启动时前端尚未监听），再通知前端来取 */
    fun queueAction(context: Context, payload: JSONObject) {
      ReminderStore.pushAction(context, payload)
      val plugin = instance ?: return
      plugin.main.post { plugin.trigger("action", JSObject()) }
    }

    fun snoozeFromAction(context: Context, key: String) {
      val source = ReminderStore.entries(context)[key] ?: ReminderStore.recall(context, key) ?: return
      snooze(context, source)
    }

    fun snooze(context: Context, source: ReminderEntry) {
      val owner = source.owner
      val entry = source.copy(
        key = "$owner:snooze",
        body = if (source.detail.isNotEmpty()) "稍后提醒 · ${source.detail}" else "稍后提醒",
        at = System.currentTimeMillis() + ReminderStore.snoozeMinutes(context) * 60_000L
      )
      val entries = ReminderStore.entries(context)
      entries[entry.key] = entry
      ReminderStore.save(context, entries)
      ReminderStore.arm(context, entry)
    }
  }

  override fun load(webView: WebView) {
    instance = this
    foreground = true
    ReminderStore.ensureChannels(activity)
    consumeIntent(activity.intent)
  }

  override fun onNewIntent(intent: Intent) {
    consumeIntent(intent)
  }

  override fun onResume() {
    foreground = true
  }

  override fun onPause() {
    foreground = false
  }

  /** 点通知本体或「完成」拉起的 Activity：取出 key 与动作，排队交给前端 */
  private fun consumeIntent(intent: Intent?) {
    val key = intent?.getStringExtra(ReminderStore.EXTRA_KEY) ?: return
    val action = intent.getStringExtra(ReminderStore.EXTRA_ACTION) ?: ReminderStore.ACTION_TAP
    val owner = intent.getStringExtra(ReminderStore.EXTRA_OWNER) ?: key.substringBeforeLast(':')
    intent.removeExtra(ReminderStore.EXTRA_KEY)
    intent.removeExtra(ReminderStore.EXTRA_ACTION)
    intent.removeExtra(ReminderStore.EXTRA_OWNER)
    NotificationManagerCompat.from(activity).cancel(ReminderStore.notificationId(key))
    val payload = JSONObject().put("action", action).put("key", key).put("owner", owner)
    queueAction(activity, payload)
  }

  /** 到点时 App 在前台且前端开启了应用内横幅：交给前端展示，不发系统通知 */
  fun deliverInForeground(entry: ReminderEntry): Boolean {
    if (!foreground || !foregroundBanner || !hasListener("delivered")) return false
    ReminderStore.remember(activity, entry)
    main.post { trigger("delivered", JSObject(entry.toJson().toString())) }
    return true
  }

  private fun notificationState(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val state = getPermissionState("notifications")
      if (state != PermissionState.GRANTED) {
        return if (state == PermissionState.DENIED) "denied" else "prompt"
      }
    }
    return if (NotificationManagerCompat.from(activity).areNotificationsEnabled()) "granted" else "denied"
  }

  private fun stateObject(): JSObject {
    val result = JSObject()
    result.put("notifications", notificationState())
    result.put("exactAlarm", if (ReminderStore.canExact(activity)) "granted" else "denied")
    result.put("pending", ReminderStore.entries(activity).size)
    return result
  }

  @Command
  fun permissionState(invoke: Invoke) {
    invoke.resolve(stateObject())
  }

  @Command
  fun requestPermission(invoke: Invoke) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && notificationState() == "prompt") {
      requestPermissionForAlias("notifications", invoke, "notificationPermissionResult")
    } else invoke.resolve(stateObject())
  }

  @PermissionCallback
  fun notificationPermissionResult(invoke: Invoke) {
    invoke.resolve(stateObject())
  }

  /** target = "notifications" 打开本应用通知设置；"exactAlarm" 打开「闹钟和提醒」授权页 */
  @Command
  fun openSettings(invoke: Invoke) {
    val target = invoke.getArgs().getString("target", "notifications")
    val intent = if (target == "exactAlarm" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${activity.packageName}"))
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
    }
    try {
      activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "无法打开系统设置")
    }
  }

  /**
   * 整体替换排期：items 之外的旧提醒撤销；「稍后提醒」只在其归属仍在 owners 里时保留，
   * 已完成或删除的事项不会再响。
   */
  @Command
  fun schedule(invoke: Invoke) {
    try {
      val args = invoke.getArgs()
      ReminderStore.setSnoozeMinutes(activity, args.optInt("snoozeMinutes", 10))
      val items = args.getJSONArray("items")
      val owners = args.getJSONArray("owners")
      val activeOwners = HashSet<String>()
      for (i in 0 until owners.length()) activeOwners.add(owners.getString(i))
      val next = LinkedHashMap<String, ReminderEntry>()
      for (i in 0 until items.length()) {
        val entry = ReminderEntry.fromJson(items.getJSONObject(i))
        next[entry.key] = entry
      }
      val current = ReminderStore.entries(activity)
      for ((key, entry) in current) {
        val keepSnooze = key.endsWith(":snooze") && activeOwners.contains(entry.owner)
        if (keepSnooze) next[key] = entry
        else if (!next.containsKey(key)) ReminderStore.disarm(activity, key)
      }
      ReminderStore.save(activity, next)
      next.values.forEach { ReminderStore.arm(activity, it) }
      invoke.resolve(stateObject())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "提醒排期失败")
    }
  }

  /** 应用内横幅的「10 分钟后」 */
  @Command
  fun snooze(invoke: Invoke) {
    try {
      snooze(activity, ReminderEntry.fromJson(invoke.getArgs().getJSObject("item")!!))
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "稍后提醒失败")
    }
  }

  /** 事项已完成：撤销它的待响提醒与已显示的通知 */
  @Command
  fun cancelOwner(invoke: Invoke) {
    val owner = invoke.getArgs().getString("owner", "")
    val entries = ReminderStore.entries(activity)
    val removed = entries.values.filter { it.owner == owner }.map { it.key }
    removed.forEach {
      entries.remove(it)
      ReminderStore.disarm(activity, it)
      NotificationManagerCompat.from(activity).cancel(ReminderStore.notificationId(it))
    }
    ReminderStore.save(activity, entries)
    invoke.resolve()
  }

  @Command
  fun takeActions(invoke: Invoke) {
    val result = JSObject()
    result.put("actions", JSArray(ReminderStore.takeActions(activity).toString()))
    invoke.resolve(result)
  }

  @Command
  fun setForegroundBanner(invoke: Invoke) {
    foregroundBanner = invoke.getArgs().getBoolean("enabled", false)
    invoke.resolve()
  }
}
