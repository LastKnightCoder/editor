package app.tauri.native_speech

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class StartArgs {
  lateinit var id: String
  lateinit var language: String
  lateinit var onEvent: Channel
}

@InvokeArg
class SessionArgs {
  lateinit var id: String
}

private class SpeechSession(val args: StartArgs, var opening: Invoke?) {
  var recognizer: SpeechRecognizer? = null
  var committed = ""
  var stopping = false
  var started = false
  var silentRounds = 0
  var elapsedMs = 0L
  var roundStartedAt = 0L
}

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")])
class NativeSpeechPlugin(private val activity: Activity) : Plugin(activity) {
  private val main = Handler(Looper.getMainLooper())
  private var session: SpeechSession? = null
  private val cancelledIds = LinkedHashSet<String>()

  @Command
  fun start(invoke: Invoke) {
    main.post {
      try {
        val args = invoke.parseArgs(StartArgs::class.java)
        if (cancelledIds.remove(args.id)) {
          invoke.reject("语音识别已取消", "cancelled")
          return@post
        }
        if (session != null) {
          invoke.reject("已有系统语音输入正在进行")
          return@post
        }
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
          invoke.reject("此设备没有可用的系统语音识别服务，请安装或启用识别引擎，或改用识别插件")
          return@post
        }
        val run = SpeechSession(args, invoke)
        session = run
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
          requestPermissionForAlias("microphone", invoke, "microphonePermissionResult")
        } else listen(run)
      } catch (error: Exception) {
        val run = session
        if (run?.opening === invoke) fail(run, error.message ?: "无法启动系统语音识别")
        else invoke.reject(error.message ?: "无法启动系统语音识别")
      }
    }
  }

  @PermissionCallback
  fun microphonePermissionResult(invoke: Invoke) {
    main.post {
      val run = session
      if (run == null || run.opening !== invoke) return@post
      if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        fail(run, "麦克风权限未授予，请在系统设置中允许 Tau 使用麦克风")
        return@post
      }
      try { listen(run) } catch (error: Exception) { fail(run, error.message ?: "无法启动系统语音识别") }
    }
  }

  private fun listen(run: SpeechSession) {
    if (session !== run || run.stopping) return
    val recognizer = SpeechRecognizer.createSpeechRecognizer(activity)
    run.recognizer = recognizer
    recognizer.setRecognitionListener(object : RecognitionListener {
      private fun current() = session === run && run.recognizer === recognizer
      override fun onReadyForSpeech(params: Bundle?) {
        if (!current()) return
        run.roundStartedAt = SystemClock.elapsedRealtime()
        run.opening?.resolve()
        run.opening = null
        if (!run.started) {
          run.started = true
          main.postDelayed({ if (session === run) stopSession(run) }, 120_000 - run.elapsedMs)
        }
      }
      override fun onBeginningOfSpeech() = Unit
      override fun onRmsChanged(rmsdB: Float) = Unit
      override fun onBufferReceived(buffer: ByteArray?) = Unit
      override fun onEndOfSpeech() = Unit
      override fun onEvent(eventType: Int, params: Bundle?) = Unit
      override fun onPartialResults(results: Bundle?) { if (current()) publish(run, "partial", run.committed + resultText(results)) }
      override fun onResults(results: Bundle?) {
        if (!current()) return
        run.committed += resultText(results)
        run.silentRounds = 0
        run.elapsedMs += SystemClock.elapsedRealtime() - run.roundStartedAt
        disposeRecognizer(run)
        if (run.stopping) finish(run) else {
          publish(run, "partial", run.committed)
          restart(run)
        }
      }
      override fun onError(error: Int) {
        if (!current()) return
        disposeRecognizer(run)
        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
          run.silentRounds++
          if (run.stopping || run.silentRounds >= 3) finish(run) else restart(run)
          return
        }
        val message = when (error) {
          SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "系统语音识别网络不可用，请检查网络后重试"
          SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "系统语音识别尚未安装此语言包，请在系统语音服务中下载后重试"
          SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "系统语音识别不支持此语言，请改用识别插件"
          SpeechRecognizer.ERROR_CLIENT, SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "系统语音识别服务正忙，请稍后重试"
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "麦克风权限未授予"
          SpeechRecognizer.ERROR_AUDIO -> "无法使用麦克风，请检查是否被其他应用占用"
          else -> "系统语音识别失败（错误码 $error），请重试或改用识别插件"
        }
        fail(run, message, if (error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) "needs-assets" else "unavailable")
      }
    })
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, run.args.language)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
    recognizer.startListening(intent)
  }

  private fun resultText(results: Bundle?) = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

  private fun restart(run: SpeechSession) {
    main.postDelayed({
      if (session === run && !run.stopping) {
        try { listen(run) } catch (error: Exception) { fail(run, error.message ?: "系统语音识别无法继续") }
      }
    }, 150)
  }

  private fun publish(run: SpeechSession, type: String, text: String, code: String? = null) {
    if (session !== run) return
    run.args.onEvent.send(JSObject().apply {
      put("id", run.args.id)
      put("type", type)
      put("text", text)
      if (code != null) put("code", code)
    })
  }

  private fun disposeRecognizer(run: SpeechSession) {
    val recognizer = run.recognizer
    run.recognizer = null
    recognizer?.cancel()
    recognizer?.destroy()
  }

  private fun clear(run: SpeechSession) {
    if (session !== run) return
    session = null
    main.removeCallbacksAndMessages(null)
    disposeRecognizer(run)
  }

  private fun finish(run: SpeechSession) {
    if (session !== run) return
    if (run.committed.isBlank()) {
      fail(run, "没有识别到语音，请重试", "invalid-input")
      return
    }
    run.opening?.resolve()
    run.opening = null
    publish(run, "final", run.committed)
    clear(run)
  }

  private fun fail(run: SpeechSession, message: String, code: String = "unavailable") {
    if (session !== run) return
    run.opening?.reject(message)
    run.opening = null
    publish(run, "error", message, code)
    clear(run)
  }

  private fun stopSession(run: SpeechSession) {
    if (session !== run || run.stopping) return
    run.stopping = true
    if (run.recognizer == null) finish(run)
    else {
      try { run.recognizer?.stopListening() } catch (error: Exception) {
        fail(run, error.message ?: "停止系统语音识别失败")
        return
      }
      main.postDelayed({ if (session === run) fail(run, "系统语音识别未能及时结束", "timeout") }, 10_000)
    }
  }

  @Command
  fun stop(invoke: Invoke) {
    main.post {
      try {
        val args = invoke.parseArgs(SessionArgs::class.java)
        session?.takeIf { it.args.id == args.id }?.let { stopSession(it) }
        invoke.resolve()
      } catch (error: Exception) { invoke.reject(error.message ?: "停止系统语音识别失败") }
    }
  }

  @Command
  fun cancel(invoke: Invoke) {
    main.post {
      try {
        val args = invoke.parseArgs(SessionArgs::class.java)
        val current = session
        if (current?.args?.id == args.id) fail(current, "语音识别已取消", "cancelled")
        else {
          cancelledIds.add(args.id)
          while (cancelledIds.size > 32) cancelledIds.remove(cancelledIds.first())
        }
        invoke.resolve()
      } catch (error: Exception) { invoke.reject(error.message ?: "取消系统语音识别失败") }
    }
  }

  override fun onStop() {
    main.post { session?.let { fail(it, "应用已进入后台，语音输入已取消", "cancelled") } }
  }

  override fun onDestroy() {
    main.post { session?.let { fail(it, "语音识别已取消", "cancelled") } }
  }
}
