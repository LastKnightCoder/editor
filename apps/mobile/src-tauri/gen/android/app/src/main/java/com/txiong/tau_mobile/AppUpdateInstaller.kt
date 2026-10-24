package com.txiong.tau_mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

// 应用内更新的安装一步：APK 已由 Rust（app_update.rs）下载到缓存目录并校验摘要，
// 这里只经 FileProvider 交给系统安装器；是否覆盖安装由用户在系统界面确认
object AppUpdateInstaller {
  const val STARTED = 0
  const val PERMISSION_REQUIRED = 1
  const val FAILED = -1

  fun install(activity: Activity, path: String): Int {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !activity.packageManager.canRequestPackageInstalls()
      ) {
        val settings = Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${activity.packageName}")
        )
        activity.startActivity(settings)
        return PERMISSION_REQUIRED
      }
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(path))
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      STARTED
    } catch (_: Throwable) {
      FAILED
    }
  }
}
