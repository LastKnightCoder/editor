import AVFoundation
import Foundation
import Tauri
import UIKit

struct StartArgs: Decodable {
  let id: String
  let path: String
  let title: String
  let onEvent: Channel
}

struct SessionArgs: Decodable {
  let id: String
}

struct StopArgs: Decodable {
  let id: String
  let output: String
}

struct FinalizeArgs: Decodable {
  let input: String
  let output: String
}

class NativeRecordPlugin: Plugin {
  private let queue = DispatchQueue(label: "app.tauri.native-record", qos: .userInitiated)
  private var recorder: AVAudioRecorder?
  private var sessionId: String?
  private var channel: Channel?
  private var meter: DispatchSourceTimer?
  /// 已录时长：暂停时累加，AVAudioRecorder.currentTime 在暂停/恢复间不可靠
  private var recordedBefore: TimeInterval = 0
  private var segmentStartedAt: Date?

  override init() {
    super.init()
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    center.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    center.addObserver(self, selector: #selector(servicesReset(_:)), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
  }

  @objc public func start(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    AVAudioSession.sharedInstance().requestRecordPermission { allowed in
      self.queue.async {
        guard allowed else {
          invoke.reject("PERMISSION_DENIED:麦克风权限未授予，请在系统设置中允许 Tau 使用麦克风")
          return
        }
        guard self.sessionId == nil else {
          invoke.reject("已有录音正在进行")
          return
        }
        do {
          try self.begin(args)
          var reply: JsonObject = [:]
          if let free = self.freeBytes() { reply["freeBytes"] = free }
          invoke.resolve(reply)
        } catch {
          self.teardown()
          invoke.reject(error.localizedDescription)
        }
      }
    }
  }

  private func begin(_ args: StartArgs) throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
    try session.setActive(true, options: .notifyOthersOnDeactivation)
    let url = URL(fileURLWithPath: args.path)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    // .aac 扩展名让 AVAudioRecorder 写 ADTS：逐帧自描述，进程被杀后已录部分仍可读
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44_100,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 64_000,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]
    let recorder = try AVAudioRecorder(url: url, settings: settings)
    recorder.isMeteringEnabled = true
    guard recorder.record() else {
      throw NSError(domain: "NativeRecord", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法开始录音"])
    }
    self.recorder = recorder
    sessionId = args.id
    channel = args.onEvent
    recordedBefore = 0
    segmentStartedAt = Date()
    startMeter()
  }

  private func elapsedMs() -> Int {
    let running = segmentStartedAt.map { Date().timeIntervalSince($0) } ?? 0
    return Int((recordedBefore + running) * 1000)
  }

  private func startMeter() {
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now(), repeating: .milliseconds(100))
    var ticks = 0
    timer.setEventHandler { [weak self] in
      guard let self, let recorder = self.recorder, recorder.isRecording else { return }
      recorder.updateMeters()
      // -60 dB 以下视为静音，线性映射到 0…1
      let power = recorder.averagePower(forChannel: 0)
      let level = max(0, min(1, (power + 60) / 60))
      ticks += 1
      var payload: JsonObject = ["type": "level", "level": level, "elapsedMs": self.elapsedMs()]
      if ticks % 50 == 0, let free = self.freeBytes() { payload["freeBytes"] = free }
      self.emit(payload)
    }
    timer.resume()
    meter = timer
  }

  private func emit(_ payload: JsonObject) {
    guard let id = sessionId else { return }
    var event = payload
    event["id"] = id
    channel?.send(event)
  }

  private func pauseRecording(reason: String) {
    // 系统中断可能已经暂停 recorder，仍需结算会话并通知界面。
    guard let recorder, let started = segmentStartedAt else { return }
    recorder.pause()
    recordedBefore += Date().timeIntervalSince(started)
    segmentStartedAt = nil
    emit(["type": "paused", "reason": reason, "elapsedMs": elapsedMs()])
  }

  @objc public func pause(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    queue.async {
      guard self.sessionId == args.id else { return invoke.reject("录音已结束") }
      self.pauseRecording(reason: "user")
      invoke.resolve()
    }
  }

  @objc public func resume(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    queue.async {
      guard self.sessionId == args.id, let recorder = self.recorder else { return invoke.reject("录音已结束") }
      guard self.segmentStartedAt == nil else { return invoke.resolve() }
      do {
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        return invoke.reject(error.localizedDescription)
      }
      guard recorder.record() else { return invoke.reject("无法继续录音，麦克风可能正被其他应用占用") }
      self.segmentStartedAt = Date()
      self.emit(["type": "resumed", "elapsedMs": self.elapsedMs()])
      invoke.resolve()
    }
  }

  @objc public func stop(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StopArgs.self)
    queue.async {
      guard self.sessionId == args.id, let recorder = self.recorder else { return invoke.reject("录音已结束") }
      let input = recorder.url
      recorder.stop()
      self.teardown()
      self.remux(input: input, output: URL(fileURLWithPath: args.output), invoke: invoke)
    }
  }

  @objc public func cancel(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    queue.async {
      if self.sessionId == args.id {
        self.recorder?.stop()
        self.teardown()
      }
      invoke.resolve()
    }
  }

  /// 本应用的系统设置页（麦克风权限在这里）
  @objc public func openSettings(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        return invoke.reject("无法打开系统设置")
      }
      UIApplication.shared.open(url)
      invoke.resolve()
    }
  }

  @objc public func finalize(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(FinalizeArgs.self)
    queue.async {
      self.remux(input: URL(fileURLWithPath: args.input), output: URL(fileURLWithPath: args.output), invoke: invoke)
    }
  }

  /// ADTS → m4a：优先无损直通，失败时重编码
  private func remux(input: URL, output: URL, invoke: Invoke) {
    try? FileManager.default.removeItem(at: output)
    let asset = AVURLAsset(url: input)
    func export(_ preset: String, fallback: (() -> Void)?) {
      guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
        if let fallback { return fallback() }
        return invoke.reject("录音文件无法保存")
      }
      session.outputURL = output
      session.outputFileType = .m4a
      session.exportAsynchronously {
        self.queue.async {
          guard session.status == .completed else {
            try? FileManager.default.removeItem(at: output)
            if let fallback { return fallback() }
            return invoke.reject(session.error?.localizedDescription ?? "录音文件保存失败")
          }
          let saved = AVURLAsset(url: output)
          let duration = CMTimeGetSeconds(saved.duration)
          let size = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber)?.int64Value ?? 0
          invoke.resolve([
            "durationMs": duration.isFinite ? Int(duration * 1000) : 0,
            "sizeBytes": size,
          ])
        }
      }
    }
    export(AVAssetExportPresetPassthrough) {
      export(AVAssetExportPresetAppleM4A, fallback: nil)
    }
  }

  private func teardown() {
    meter?.cancel()
    meter = nil
    recorder = nil
    sessionId = nil
    channel = nil
    segmentStartedAt = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func freeBytes() -> Int64? {
    let url = URL(fileURLWithPath: NSHomeDirectory())
    let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    return values?.volumeAvailableCapacityForImportantUsage
  }

  // 来电、闹钟、其他应用抢占：转为暂停，结束后不自动继续，避免录进通话后的环境声
  @objc private func interrupted(_ notification: Notification) {
    guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      AVAudioSession.InterruptionType(rawValue: raw) == .began
    else { return }
    queue.async { self.pauseRecording(reason: "interruption") }
  }

  // 拔耳机、蓝牙断开：原输入设备不在了，转为暂停
  @objc private func routeChanged(_ notification: Notification) {
    guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable
    else { return }
    queue.async { self.pauseRecording(reason: "route") }
  }

  @objc private func servicesReset(_ notification: Notification) {
    queue.async {
      guard self.sessionId != nil else { return }
      // 先通知再清理：清理后 emit 拿不到会话；已录部分留在文件里，由宿主走找回
      self.emit(["type": "error", "message": "系统音频服务重置，录音已中断"])
      self.recorder?.stop()
      self.teardown()
    }
  }
}

@_cdecl("init_plugin_native_record")
func initPlugin() -> Plugin {
  NativeRecordPlugin()
}
