package app.tauri.native_record

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.provider.Settings
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
import java.io.File
import java.nio.ByteBuffer
import kotlin.concurrent.thread
import kotlin.math.log10

@InvokeArg
class StartArgs {
  lateinit var id: String
  lateinit var path: String
  lateinit var title: String
  lateinit var onEvent: Channel
}

@InvokeArg
class SessionArgs {
  lateinit var id: String
}

@InvokeArg
class StopArgs {
  lateinit var id: String
  lateinit var output: String
}

@InvokeArg
class FinalizeArgs {
  lateinit var input: String
  lateinit var output: String
}

private class Recording(val args: StartArgs, val recorder: MediaRecorder) {
  var paused = false
  /** 暂停前已录时长 */
  var recordedBefore = 0L
  var segmentStartedAt = elapsedNow()
  var ticks = 0
  fun elapsedMs() = recordedBefore + if (paused) 0 else elapsedNow() - segmentStartedAt
}

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")])
class NativeRecordPlugin(private val activity: Activity) : Plugin(activity) {
  private val main = Handler(Looper.getMainLooper())
  private val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var current: Recording? = null
  private var pendingStart: Invoke? = null

  // 拔耳机、蓝牙断开：原输入设备不在了，转为暂停
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      main.post { pauseRecording("route") }
    }
  }

  private val meter = object : Runnable {
    override fun run() {
      val run = current ?: return
      if (!run.paused) {
        // 通话中系统会让其他应用的麦克风静音：检测到就转为暂停，结束后不自动继续
        if (audio.mode == AudioManager.MODE_IN_CALL || audio.mode == AudioManager.MODE_IN_COMMUNICATION) {
          pauseRecording("interruption")
        } else {
          val amplitude = try { run.recorder.maxAmplitude } catch (_: Exception) { 0 }
          val db = if (amplitude > 0) 20 * log10(amplitude / 32767.0) else -60.0
          run.ticks += 1
          emit(JSObject().apply {
            put("type", "level")
            put("level", ((db + 60) / 60).coerceIn(0.0, 1.0))
            put("elapsedMs", run.elapsedMs())
            if (run.ticks % 50 == 0) freeBytes()?.let { put("freeBytes", it) }
          })
        }
      }
      main.postDelayed(this, 100)
    }
  }

  @Command
  fun start(invoke: Invoke) {
    main.post {
      if (current != null || pendingStart != null) {
        invoke.reject("已有录音正在进行")
        return@post
      }
      if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        pendingStart = invoke
        requestPermissionForAlias("microphone", invoke, "microphonePermissionResult")
      } else begin(invoke)
    }
  }

  @PermissionCallback
  fun microphonePermissionResult(invoke: Invoke) {
    main.post {
      if (pendingStart !== invoke) return@post
      pendingStart = null
      if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        invoke.reject("PERMISSION_DENIED:麦克风权限未授予，请在系统设置中允许 Tau 使用麦克风")
      } else begin(invoke)
    }
  }

  private fun begin(invoke: Invoke) {
    val args = try { invoke.parseArgs(StartArgs::class.java) } catch (error: Exception) {
      invoke.reject(error.message ?: "录音参数无效")
      return
    }
    val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(activity) else @Suppress("DEPRECATION") MediaRecorder()
    try {
      File(args.path).parentFile?.mkdirs()
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      // ADTS 逐帧自描述，进程被杀后已录部分仍可读；停止时重封装为 m4a
      recorder.setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS)
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      recorder.setAudioChannels(1)
      recorder.setAudioSamplingRate(44_100)
      recorder.setAudioEncodingBitRate(64_000)
      recorder.setOutputFile(args.path)
      recorder.prepare()
      // 前台服务须在应用可见时启动（Android 14 起限制后台启动麦克风类前台服务）
      RecordingService.onToggle = { main.post { toggleFromNotification() } }
      RecordingService.update(activity, args.title, false, 0)
      recorder.start()
    } catch (error: Exception) {
      recorder.release()
      RecordingService.stop(activity)
      invoke.reject(error.message ?: "无法开始录音，麦克风可能正被其他应用占用")
      return
    }
    current = Recording(args, recorder)
    ContextCompat.registerReceiver(
      activity,
      noisy,
      IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
    main.post(meter)
    invoke.resolve(JSObject().apply { freeBytes()?.let { put("freeBytes", it) } })
  }

  private fun emit(payload: JSObject) {
    val run = current ?: return
    payload.put("id", run.args.id)
    run.args.onEvent.send(payload)
  }

  private fun pauseRecording(reason: String): Boolean {
    val run = current ?: return false
    if (run.paused) return true
    return try {
      run.recorder.pause()
      run.recordedBefore = run.elapsedMs()
      run.paused = true
      RecordingService.update(activity, run.args.title, true, run.recordedBefore)
      emit(JSObject().apply {
        put("type", "paused")
        put("reason", reason)
        put("elapsedMs", run.recordedBefore)
      })
      true
    } catch (_: Exception) { false }
  }

  private fun resumeRecording(): Boolean {
    val run = current ?: return false
    if (!run.paused) return true
    return try {
      run.recorder.resume()
      run.paused = false
      run.segmentStartedAt = elapsedNow()
      RecordingService.update(activity, run.args.title, false, run.recordedBefore)
      emit(JSObject().apply {
        put("type", "resumed")
        put("elapsedMs", run.recordedBefore)
      })
      true
    } catch (_: Exception) { false }
  }

  private fun toggleFromNotification() {
    val run = current ?: return
    if (run.paused) resumeRecording() else pauseRecording("user")
  }

  @Command
  fun pause(invoke: Invoke) {
    main.post {
      val args = invoke.parseArgs(SessionArgs::class.java)
      if (current?.args?.id != args.id) return@post invoke.reject("录音已结束")
      if (pauseRecording("user")) invoke.resolve() else invoke.reject("暂停录音失败")
    }
  }

  @Command
  fun resume(invoke: Invoke) {
    main.post {
      val args = invoke.parseArgs(SessionArgs::class.java)
      if (current?.args?.id != args.id) return@post invoke.reject("录音已结束")
      if (resumeRecording()) invoke.resolve() else invoke.reject("无法继续录音，麦克风可能正被其他应用占用")
    }
  }

  @Command
  fun stop(invoke: Invoke) {
    main.post {
      val args = invoke.parseArgs(StopArgs::class.java)
      val run = current
      if (run == null || run.args.id != args.id) return@post invoke.reject("录音已结束")
      release(run)
      thread { remux(run.args.path, args.output, invoke) }
    }
  }

  @Command
  fun cancel(invoke: Invoke) {
    main.post {
      val args = invoke.parseArgs(SessionArgs::class.java)
      val run = current
      if (run != null && run.args.id == args.id) release(run)
      invoke.resolve()
    }
  }

  /** 本应用的系统设置页（麦克风权限在这里） */
  @Command
  fun openSettings(invoke: Invoke) {
    try {
      activity.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "无法打开系统设置")
    }
  }

  @Command
  fun finalize(invoke: Invoke) {
    val args = invoke.parseArgs(FinalizeArgs::class.java)
    thread { remux(args.input, args.output, invoke) }
  }

  private fun release(run: Recording) {
    main.removeCallbacks(meter)
    try { activity.unregisterReceiver(noisy) } catch (_: Exception) {}
    try { run.recorder.stop() } catch (_: Exception) {
      // 刚开始就停止时 MediaRecorder 会抛错，已写入的部分仍保留在文件里
    }
    run.recorder.release()
    RecordingService.onToggle = null
    RecordingService.stop(activity)
    current = null
  }

  /** ADTS → m4a 无损重封装 */
  private fun remux(input: String, output: String, invoke: Invoke) {
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    try {
      extractor.setDataSource(input)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw IllegalStateException("录音文件没有音轨")
      extractor.selectTrack(track)
      File(output).delete()
      muxer = MediaMuxer(output, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val target = muxer.addTrack(extractor.getTrackFormat(track))
      muxer.start()
      val buffer = ByteBuffer.allocate(256 * 1024)
      val info = MediaCodec.BufferInfo()
      var lastUs = 0L
      while (true) {
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) break
        info.set(0, size, extractor.sampleTime, MediaCodec.BUFFER_FLAG_KEY_FRAME)
        lastUs = info.presentationTimeUs
        muxer.writeSampleData(target, buffer, info)
        extractor.advance()
      }
      muxer.stop()
      invoke.resolve(JSObject().apply {
        put("durationMs", lastUs / 1000)
        put("sizeBytes", File(output).length())
      })
    } catch (error: Exception) {
      File(output).delete()
      invoke.reject(error.message ?: "录音文件保存失败")
    } finally {
      try { muxer?.release() } catch (_: Exception) {}
      extractor.release()
    }
  }

  private fun freeBytes(): Long? = try { StatFs(activity.filesDir.path).availableBytes } catch (_: Exception) { null }
}
