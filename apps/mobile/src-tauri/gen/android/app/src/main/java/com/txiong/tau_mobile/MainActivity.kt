package com.txiong.tau_mobile

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import kotlin.math.max

// 与 Rust 侧 incoming_file::MAX_BYTES 一致：复制到略超上限即停，超限由 Rust 统一报错
private const val INCOMING_MAX_BYTES = 5L * 1024 * 1024

class MainActivity : TauriActivity() {
  private var lastKeyboardHeight = Int.MIN_VALUE
  private var lastSafeInsets = ""
  private var pendingIncomingPath: String? = null

  private fun resolveWebView(): WebView? {
    return try {
      val field = WryActivity::class.java.getDeclaredField("mWebView")
      field.isAccessible = true
      field.get(this) as? WebView
    } catch (_: Throwable) {
      null
    }
  }

  private fun publishKeyboardHeight(height: Int) {
    if (height == lastKeyboardHeight) {
      return
    }
    lastKeyboardHeight = height
    val js = """
      (function () {
        try {
          var rawHeight = $height;
          var dpr = Math.max(1, Number(window.devicePixelRatio || 1));
          var cssHeight = Math.max(0, Math.round(rawHeight / dpr));
          var inner = Math.max(0, Math.round(window.innerHeight || 0));
          var clampedCssHeight = Math.max(0, Math.min(cssHeight, Math.max(0, inner - 1)));
          window.__TAU_NATIVE_KB_HEIGHT_RAW = rawHeight;
          window.__TAU_NATIVE_KB_HEIGHT = clampedCssHeight;
          window.dispatchEvent(new CustomEvent('tau:native-kb-height', { detail: { height: clampedCssHeight, rawHeight: rawHeight, dpr: dpr } }));
        } catch (_) {}
      })();
    """.trimIndent()
    val webView = resolveWebView()
    webView?.post {
      webView.evaluateJavascript(js, null)
    }
  }

  // 系统栏占位写入 --native-safe-*，供不支持 env(safe-area-inset-*) 的 WebView 兜底；--kb-* 由前端 Provider 统一写入
  private fun publishSafeInsets(top: Int, bottom: Int) {
    val key = "$top:$bottom"
    if (key == lastSafeInsets) {
      return
    }
    lastSafeInsets = key
    val js = """
      (function () {
        try {
          var dpr = Math.max(1, Number(window.devicePixelRatio || 1));
          var root = document.documentElement;
          root.style.setProperty('--native-safe-top', Math.round($top / dpr) + 'px');
          root.style.setProperty('--native-safe-bottom', Math.round($bottom / dpr) + 'px');
        } catch (_) {}
      })();
    """.trimIndent()
    val webView = resolveWebView()
    webView?.post {
      webView.evaluateJavascript(js, null)
    }
  }

  // 外部「用其他应用打开」的文件：content:// 授权只在本次 intent 内有效，先复制进缓存目录，
  // 路径由 Rust 经 JNI 调 takeIncomingFile 取走后读取并删除
  private fun receiveIncomingFile(intent: Intent?) {
    if (intent?.action != Intent.ACTION_VIEW) {
      return
    }
    val uri = intent.data ?: return
    try {
      val dir = File(cacheDir, "incoming").apply { mkdirs() }
      dir.listFiles()?.forEach { it.delete() }
      val target = File(dir, incomingFileName(uri, intent.type))
      contentResolver.openInputStream(uri)?.use { input ->
        target.outputStream().use { output -> copyLimited(input, output) }
      } ?: return
      pendingIncomingPath = target.absolutePath
      notifyIncomingFile()
    } catch (_: Throwable) {
      pendingIncomingPath = null
    }
  }

  private fun incomingFileName(uri: Uri, mimeType: String?): String {
    val displayName = try {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (_: Throwable) {
      null
    } ?: uri.lastPathSegment
    val safeName = displayName
      ?.substringAfterLast('/')
      ?.replace(Regex("[\\\\:*?\"<>|]"), "_")
      ?.takeIf { it.isNotBlank() }
      ?: "未命名"
    val isMarkdownMime = mimeType == "text/markdown" || mimeType == "text/x-markdown"
    return if (isMarkdownMime && !safeName.contains('.')) "$safeName.md" else safeName
  }

  private fun copyLimited(input: InputStream, output: OutputStream) {
    val buffer = ByteArray(8192)
    var total = 0L
    while (total <= INCOMING_MAX_BYTES) {
      val read = input.read(buffer)
      if (read < 0) {
        break
      }
      output.write(buffer, 0, read)
      total += read
    }
  }

  // 冷启动时 WebView 尚未加载，事件会丢失，由前端启动时主动 take 兜底
  private fun notifyIncomingFile() {
    val webView = resolveWebView() ?: return
    webView.post {
      webView.evaluateJavascript("window.dispatchEvent(new Event('tau:incoming-file'))", null)
    }
  }

  fun takeIncomingFile(): String? {
    val path = pendingIncomingPath
    pendingIncomingPath = null
    return path
  }

  // 由 Rust 经 JNI 调用；返回值含义见 AppUpdateInstaller
  fun installAppUpdate(path: String): Int = AppUpdateInstaller.install(this, path)

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    receiveIncomingFile(intent)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    val rootView = window.decorView
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { _, insets ->
      val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
      val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom

      // 边缘到边缘下 WebView 铺到屏幕底缘，ime inset 已含导航栏区域，即键盘对页面底部的完整遮挡
      val keyboardHeight = if (imeVisible) max(0, imeBottom) else 0
      publishKeyboardHeight(keyboardHeight)
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      publishSafeInsets(bars.top, bars.bottom)
      insets
    }
    rootView.post {
      publishKeyboardHeight(0)
      ViewCompat.requestApplyInsets(rootView)
    }
    // 配置变更重建时 intent 不变，只在首次创建时接收，避免同一文件重复弹出导入页
    if (savedInstanceState == null) {
      receiveIncomingFile(intent)
    }
  }
}
