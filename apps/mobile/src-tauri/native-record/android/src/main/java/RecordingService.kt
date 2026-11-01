package app.tauri.native_record

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/** 录音期间的前台服务：保持进程在后台继续录，常驻通知显示计时并可暂停 / 继续 */
class RecordingService : Service() {
  companion object {
    const val ACTION_UPDATE = "app.tauri.native_record.UPDATE"
    const val ACTION_TOGGLE = "app.tauri.native_record.TOGGLE"
    const val EXTRA_TITLE = "title"
    const val EXTRA_PAUSED = "paused"
    const val EXTRA_ELAPSED = "elapsedMs"
    private const val CHANNEL_ID = "tau-recording"
    private const val NOTIFICATION_ID = 0x7461

    /** 通知上的暂停 / 继续按钮回调到插件 */
    @Volatile var onToggle: (() -> Unit)? = null

    fun update(context: Context, title: String, paused: Boolean, elapsedMs: Long) {
      val intent = Intent(context, RecordingService::class.java)
        .setAction(ACTION_UPDATE)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_PAUSED, paused)
        .putExtra(EXTRA_ELAPSED, elapsedMs)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, RecordingService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_TOGGLE) {
      onToggle?.invoke()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "录音"
    val paused = intent?.getBooleanExtra(EXTRA_PAUSED, false) ?: false
    val elapsed = intent?.getLongExtra(EXTRA_ELAPSED, 0L) ?: 0L
    val notification = build(title, paused, elapsed)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else startForeground(NOTIFICATION_ID, notification)
    // 进程被杀后不由系统重启服务：录音会话已不存在，遗留文件由应用下次打开时找回
    return START_NOT_STICKY
  }

  private fun build(title: String, paused: Boolean, elapsedMs: Long): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "录音", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) }
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val toggle = PendingIntent.getService(
      this,
      1,
      Intent(this, RecordingService::class.java).setAction(ACTION_TOGGLE),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(if (paused) "录音已暂停" else "正在录音")
      .setContentText(title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(launch)
      .setUsesChronometer(!paused)
      .setWhen(System.currentTimeMillis() - elapsedMs)
      .setShowWhen(!paused)
      .addAction(0, if (paused) "继续" else "暂停", toggle)
      .build()
  }

  override fun onDestroy() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}

internal fun elapsedNow(): Long = SystemClock.elapsedRealtime()
