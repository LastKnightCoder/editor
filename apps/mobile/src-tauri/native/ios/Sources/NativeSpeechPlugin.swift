import AVFoundation
import Foundation
import Speech
import Tauri

struct StartArgs: Decodable {
  let id: String
  let language: String
  let onEvent: Channel
}

struct SessionArgs: Decodable {
  let id: String
}

class NativeSpeechPlugin: Plugin {
  private let engine = AVAudioEngine()
  private var recognizer: SFSpeechRecognizer?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var eventChannel: Channel?
  private var sessionId: String?
  private var committed = ""
  private var stopping = false
  private var startedAt: Date?
  private var cancelledIds = Set<String>()
  private var taskGeneration = 0
  private var audioSessionActive = false
  private var tapInstalled = false

  @objc public func start(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    SFSpeechRecognizer.requestAuthorization { speechStatus in
      AVAudioSession.sharedInstance().requestRecordPermission { microphoneAllowed in
        DispatchQueue.main.async {
          if self.cancelledIds.remove(args.id) != nil {
            invoke.reject("语音识别已取消")
            return
          }
          guard self.sessionId == nil else {
            invoke.reject("已有系统语音输入正在进行")
            return
          }
          self.sessionId = args.id
          self.eventChannel = args.onEvent
          guard speechStatus == .authorized else {
            invoke.reject("语音识别权限未授予")
            self.fail("语音识别权限未授予，请在系统设置中允许 Tau 使用语音识别", code: "unavailable")
            return
          }
          guard microphoneAllowed else {
            invoke.reject("麦克风权限未授予")
            self.fail("麦克风权限未授予，请在系统设置中允许 Tau 使用麦克风", code: "unavailable")
            return
          }
          do {
            try self.begin(args)
            invoke.resolve()
          } catch {
            invoke.reject(error.localizedDescription)
            self.fail(error.localizedDescription)
          }
        }
      }
    }
  }

  private func begin(_ args: StartArgs) throws {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: args.language)) else {
      throw NSError(domain: "NativeSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "系统不支持此识别语言"])
    }
    guard recognizer.isAvailable else {
      throw NSError(domain: "NativeSpeech", code: 2, userInfo: [NSLocalizedDescriptionKey: "系统语音识别当前不可用，请检查网络或稍后重试"])
    }
    self.recognizer = recognizer
    if startedAt == nil { startedAt = Date() }
    taskGeneration += 1
    let generation = taskGeneration
    let audioRequest = SFSpeechAudioBufferRecognitionRequest()
    audioRequest.shouldReportPartialResults = true
    request = audioRequest
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
      audioRequest.append(buffer)
    }
    tapInstalled = true
    engine.prepare()
    try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
    try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
    audioSessionActive = true
    try engine.start()
    task = recognizer.recognitionTask(with: audioRequest) { [weak self] result, error in
      guard let self, self.sessionId == args.id, self.taskGeneration == generation else { return }
      if let result {
        let text = result.bestTranscription.formattedString
        if result.isFinal {
          self.committed += text
          if self.committed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            self.fail("没有识别到语音，请重试", code: "invalid-input")
            return
          }
          if self.stopping || (self.startedAt.map { Date().timeIntervalSince($0) >= 120 } ?? false) {
            self.publish("final", text: self.committed)
            self.clearSession()
          } else {
            self.publish("partial", text: self.committed)
            self.restart(args)
          }
          return
        } else {
          self.publish("partial", text: self.committed + text)
        }
      }
      if let error {
        self.fail(error.localizedDescription)
      }
    }
  }

  private func publish(_ type: String, text: String, code: String? = nil) {
    guard let id = sessionId else { return }
    var payload: JsonObject = ["id": id, "type": type, "text": text]
    if let code { payload["code"] = code }
    eventChannel?.send(payload)
  }

  private func endAudio() {
    if engine.isRunning { engine.stop() }
    if tapInstalled {
      engine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    request?.endAudio()
    request = nil
    if audioSessionActive {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      audioSessionActive = false
    }
  }

  private func restart(_ args: StartArgs) {
    endAudio()
    taskGeneration += 1
    task?.cancel()
    task = nil
    recognizer = nil
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
      guard let self, self.sessionId == args.id, !self.stopping else { return }
      do { try self.begin(args) } catch { self.fail(error.localizedDescription) }
    }
  }

  private func clearSession() {
    endAudio()
    taskGeneration += 1
    task?.cancel()
    task = nil
    recognizer = nil
    eventChannel = nil
    sessionId = nil
    committed = ""
    stopping = false
    startedAt = nil
  }

  private func fail(_ message: String, code: String = "unavailable") {
    publish("error", text: message, code: code)
    clearSession()
  }

  @objc public func stop(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    guard sessionId == args.id else {
      invoke.resolve()
      return
    }
    stopping = true
    endAudio()
    invoke.resolve()
  }

  @objc public func cancel(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    if sessionId == args.id { fail("语音识别已取消", code: "cancelled") }
    else {
      cancelledIds.insert(args.id)
      if cancelledIds.count > 32, let oldest = cancelledIds.first { cancelledIds.remove(oldest) }
    }
    invoke.resolve()
  }
}

@_cdecl("init_plugin_native_speech")
func initPlugin() -> Plugin {
  NativeSpeechPlugin()
}
