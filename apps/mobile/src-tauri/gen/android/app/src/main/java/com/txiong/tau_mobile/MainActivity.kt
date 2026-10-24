package com.txiong.tau_mobile

import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : TauriActivity() {
  private var lastKeyboardHeight = Int.MIN_VALUE
  private var lastSafeInsets = ""

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
  }
}
