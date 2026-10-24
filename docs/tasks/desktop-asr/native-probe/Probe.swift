import AVFoundation
import AppKit
import Foundation
import Speech

// 每块缓冲区只移交一次，转换器回调通过锁领取，不再修改音频内容。
final class ConversionSource: @unchecked Sendable {
    private let lock = NSLock()
    private let buffer: AVAudioPCMBuffer?
    private var provided = false
    init(_ buffer: AVAudioPCMBuffer?) { self.buffer = buffer }
    func read(_ status: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
        lock.lock()
        defer { lock.unlock() }
        if let buffer, !provided {
            provided = true
            status.pointee = .haveData
            return buffer
        }
        status.pointee = buffer == nil ? .endOfStream : .noDataNow
        return nil
    }
}

@MainActor
final class RecognitionStats {
    var stopTime: Double?
    var firstResultMs: Int?
    var partialCount = 0
    var finalCount = 0
    var finalTexts: [String] = []
}

@MainActor
func readResults(_ transcriber: SpeechTranscriber, stats: RecognitionStats, start: Double, logText: Bool,
                 preview: ((String) -> Void)? = nil) -> Task<Void, Error> {
    Task { @MainActor in
        for try await result in transcriber.results {
            let now = ProcessInfo.processInfo.systemUptime
            let text = String(result.text.characters)
            preview?(text)
            if stats.firstResultMs == nil && !text.isEmpty { stats.firstResultMs = Int((now - start) * 1000) }
            if result.isFinal {
                stats.finalCount += 1
                stats.finalTexts.append(text)
            } else { stats.partialCount += 1 }
            var fields: [String: Any] = ["elapsedMs": Int((now - start) * 1000), "final": result.isFinal,
                "afterStop": stats.stopTime != nil, "startMs": Int(result.range.start.seconds * 1000),
                "endMs": Int(CMTimeRangeGetEnd(result.range).seconds * 1000), "characters": text.count]
            if logText { fields["text"] = text }
            emit("recognition", fields)
        }
    }
}

@MainActor
func recognizeFile(_ path: String, paced: Bool, transcriber: SpeechTranscriber, detectSpeech: Bool) async throws {
    let audio = try AVAudioFile(forReading: URL(fileURLWithPath: path), commonFormat: .pcmFormatInt16, interleaved: false)
    let format = audio.processingFormat
    guard format.sampleRate == 16000 && format.channelCount == 1 else {
        throw NSError(domain: "TauASRProbe", code: 9, userInfo: [NSLocalizedDescriptionKey: "文件探针仅接受 16 kHz 单声道音频，请先转换"])
    }
    let detector = detectSpeech ? SpeechDetector(detectionOptions: .init(sensitivityLevel: .medium), reportResults: true) : nil
    var modules: [any SpeechModule] = [transcriber]
    if let detector { modules.append(detector) }
    let analyzer = SpeechAnalyzer(modules: modules)
    let prepareStart = ProcessInfo.processInfo.systemUptime
    try await analyzer.prepareToAnalyze(in: format)
    emit("analyzer-ready", ["elapsedMs": Int((ProcessInfo.processInfo.systemUptime - prepareStart) * 1000), "sampleRate": format.sampleRate])
    let start = ProcessInfo.processInfo.systemUptime
    let stats = RecognitionStats()
    let reader = readResults(transcriber, stats: stats, start: start, logText: true)
    let detectorReader = Task { @MainActor () throws -> (count: Int, detected: Bool) in
        var detected = false
        var count = 0
        if let detector {
            for try await result in detector.results {
                count += 1
                detected = detected || result.speechDetected
                emit("speech-detection", ["detected": result.speechDetected, "final": result.isFinal,
                     "startMs": Int(result.range.start.seconds * 1000), "endMs": Int(CMTimeRangeGetEnd(result.range).seconds * 1000)])
            }
        }
        return (count, detected)
    }
    let (input, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingOldest(10))
    do {
        try await analyzer.start(inputSequence: input)
        let frameSize = AVAudioFrameCount(format.sampleRate * 0.2)
        var submitted: AVAudioFramePosition = 0
        while audio.framePosition < audio.length {
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameSize)!
            try audio.read(into: buffer, frameCount: frameSize)
            if paced {
                let deadline = start + Double(submitted + Int64(buffer.frameLength)) / format.sampleRate
                let remaining = deadline - ProcessInfo.processInfo.systemUptime
                if remaining > 0 { try await Task.sleep(for: .seconds(remaining)) }
            }
            let time = CMTime(value: submitted, timescale: Int32(format.sampleRate))
            switch continuation.yield(AnalyzerInput(buffer: buffer, bufferStartTime: time)) {
            case .enqueued: break
            case .dropped, .terminated:
                throw NSError(domain: "TauASRProbe", code: 2, userInfo: [NSLocalizedDescriptionKey: "音频队列溢出或提前结束"])
            @unknown default: fatalError("未知音频队列状态")
            }
            submitted += Int64(buffer.frameLength)
            if !paced { try await Task.sleep(for: .milliseconds(20)) }
        }
        stats.stopTime = ProcessInfo.processInfo.systemUptime
        emit("end-input", ["elapsedMs": Int((stats.stopTime! - start) * 1000), "audioDurationMs": Int(Double(submitted) / format.sampleRate * 1000)])
        continuation.finish()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        try await reader.value
        let detection = try await detectorReader.value
        emit("summary", ["firstResultMs": stats.firstResultMs ?? -1, "partialCount": stats.partialCount,
             "finalCount": stats.finalCount, "tailMs": Int((ProcessInfo.processInfo.systemUptime - stats.stopTime!) * 1000),
             "text": stats.finalTexts.joined(), "paced": paced, "detectorEnabled": detectSpeech,
             "detectorEventCount": detection.count,
             "reportedSpeechDetected": detection.count > 0 ? detection.detected as Any : NSNull()])
    } catch {
        continuation.finish()
        await analyzer.cancelAndFinishNow()
        reader.cancel()
        detectorReader.cancel()
        _ = try? await reader.value
        _ = try? await detectorReader.value
        throw error
    }
}

@MainActor
func recognizeMicrophone(_ transcriber: SpeechTranscriber) async throws {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 180),
                          styleMask: [.titled], backing: .buffered, defer: false)
    window.title = "Tau 中文语音测试"
    let label = NSTextField(wrappingLabelWithString: "正在准备麦克风权限……")
    label.frame = NSRect(x: 24, y: 80, width: 512, height: 72)
    label.font = .systemFont(ofSize: 20)
    let preview = NSTextField(wrappingLabelWithString: "录音不会保存；结束后自动关闭。")
    preview.frame = NSRect(x: 24, y: 12, width: 512, height: 64)
    window.contentView?.addSubview(label)
    window.contentView?.addSubview(preview)
    window.center()
    window.makeKeyAndOrderFront(nil)
    app.activate(ignoringOtherApps: true)
    defer { window.orderOut(nil) }
    guard await AVCaptureDevice.requestAccess(for: .audio) else {
        throw NSError(domain: "TauASRProbe", code: 4, userInfo: [NSLocalizedDescriptionKey: "麦克风权限未授予"])
    }
    let engine = AVAudioEngine()
    let sourceFormat = engine.inputNode.outputFormat(forBus: 0)
    guard let targetFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]),
          let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else {
        throw NSError(domain: "TauASRProbe", code: 5, userInfo: [NSLocalizedDescriptionKey: "无法建立麦克风格式转换"])
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber, SpeechDetector(detectionOptions: .init(sensitivityLevel: .medium), reportResults: false)])
    try await analyzer.prepareToAnalyze(in: targetFormat)
    let (captured, capture) = AsyncThrowingStream<AnalyzerInput, Error>.makeStream(bufferingPolicy: .bufferingOldest(20))
    let (input, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingOldest(20))
    engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: sourceFormat) { @Sendable buffer, _ in
        guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return }
        copy.frameLength = buffer.frameLength
        let source = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        let destination = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
        for (src, dst) in zip(source, destination) { memcpy(dst.mData!, src.mData!, Int(src.mDataByteSize)) }
        if case .dropped = capture.yield(AnalyzerInput(buffer: copy)) {
            capture.finish(throwing: NSError(domain: "TauASRProbe", code: 6, userInfo: [NSLocalizedDescriptionKey: "麦克风采集队列溢出"]))
        }
    }
    var tapInstalled = true
    defer {
        engine.stop()
        if tapInstalled { engine.inputNode.removeTap(onBus: 0) }
        capture.finish()
        continuation.finish()
    }
    for remaining in stride(from: 5, through: 1, by: -1) {
        label.stringValue = "\(remaining) 秒后开始，录音持续 15 秒"
        try await Task.sleep(for: .seconds(1))
    }
    let start = ProcessInfo.processInfo.systemUptime
    let stats = RecognitionStats()
    let reader = readResults(transcriber, stats: stats, start: start, logText: false) { text in
        preview.stringValue = text
    }
    try await analyzer.start(inputSequence: input)
    var submitted: Int64 = 0
    func convert(_ buffer: AVAudioPCMBuffer?) throws {
        let source = ConversionSource(buffer)
        repeat {
            let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: 8192)!
            var conversionError: NSError?
            let status = converter.convert(to: output, error: &conversionError) { _, status in
                source.read(status)
            }
            if let conversionError { throw conversionError }
            if output.frameLength > 0 {
                let frame = AnalyzerInput(buffer: output, bufferStartTime: CMTime(value: submitted, timescale: Int32(targetFormat.sampleRate)))
                if case .enqueued = continuation.yield(frame) {} else {
                    throw NSError(domain: "TauASRProbe", code: 7, userInfo: [NSLocalizedDescriptionKey: "识别发送队列溢出或结束"])
                }
                submitted += Int64(output.frameLength)
            }
            if status == .endOfStream || status == .inputRanDry { return }
            if status == .error { throw NSError(domain: "TauASRProbe", code: 8) }
        } while true
    }
    do {
        try engine.start()
        label.stringValue = "正在录音，请开始朗读（15 秒）"
        emit("microphone-started", ["durationSeconds": 15, "sourceRate": sourceFormat.sampleRate,
             "targetRate": targetFormat.sampleRate, "targetCommonFormat": targetFormat.commonFormat.rawValue])
        let timer = Task { @MainActor in
            for remaining in stride(from: 15, through: 1, by: -1) {
                label.stringValue = "正在录音，还剩 \(remaining) 秒"
                try await Task.sleep(for: .seconds(1))
            }
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
            stats.stopTime = ProcessInfo.processInfo.systemUptime
            emit("microphone-stopped")
            label.stringValue = "已停止收音，正在等待最后一句……"
            capture.finish()
        }
        defer { timer.cancel() }
        for try await packet in captured { try convert(packet.buffer) }
        try convert(nil)
        continuation.finish()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        try await reader.value
        let text = stats.finalTexts.joined()
        emit("microphone-summary", ["firstResultMs": stats.firstResultMs ?? -1, "partialCount": stats.partialCount,
             "finalCount": stats.finalCount, "tailMs": Int((ProcessInfo.processInfo.systemUptime - (stats.stopTime ?? start)) * 1000),
             "characters": text.count, "tailMarkerMatched": text.contains("春夏秋冬雨"),
             "audioDurationMs": Int(Double(submitted) / targetFormat.sampleRate * 1000)])
        label.stringValue = "测试完成，尾句\(text.contains("春夏秋冬雨") ? "已保留" : "未匹配到指定五字")"
        try await Task.sleep(for: .seconds(3))
    } catch {
        await analyzer.cancelAndFinishNow()
        reader.cancel()
        _ = try? await reader.value
        throw error
    }
}

func emit(_ event: String, _ fields: [String: Any] = [:]) {
    var record = fields
    record["event"] = event
    record["uptimeMs"] = Int(ProcessInfo.processInfo.systemUptime * 1000)
    if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
}

@main
struct Probe {
    static func main() async {
        let watchdog = Task.detached {
            try? await Task.sleep(for: .seconds(90))
            if !Task.isCancelled { emit("timeout"); exit(2) }
        }
        defer { watchdog.cancel() }
        do {
            let command = CommandLine.arguments.dropFirst().first ?? "probe"
            guard ["probe", "prepare", "stream", "file", "mic", "release"].contains(command) else {
                throw NSError(domain: "TauASRProbe", code: 10, userInfo: [NSLocalizedDescriptionKey: "未知命令；支持 probe/prepare/stream/file/mic/release"])
            }
            let requestedLocale = Locale(identifier: "zh-CN")
            guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
                throw NSError(domain: "TauASRProbe", code: 1, userInfo: [NSLocalizedDescriptionKey: "当前设备不支持简体中文"])
            }
            let transcriber = SpeechTranscriber(locale: locale, preset: .timeIndexedProgressiveTranscription)
            let installed = await SpeechTranscriber.installedLocales.map(\.identifier).sorted()
            let supported = await SpeechTranscriber.supportedLocales.map(\.identifier).sorted()
            let reserved = await AssetInventory.reservedLocales.map(\.identifier).sorted()
            let status = await AssetInventory.status(forModules: [transcriber])
            emit("inventory", [
                "os": ProcessInfo.processInfo.operatingSystemVersionString,
                "available": SpeechTranscriber.isAvailable,
                "resolvedLocale": locale.identifier,
                "supportedLocales": supported,
                "installedLocales": installed,
                "reservedLocales": reserved,
                "zhStatus": String(describing: status),
                "microphoneAuthorization": AVCaptureDevice.authorizationStatus(for: .audio).rawValue,
                "legacySpeechAuthorization": SFSpeechRecognizer.authorizationStatus().rawValue,
                "legacyZhAvailable": SFSpeechRecognizer(locale: locale)?.isAvailable ?? false,
                "legacyZhOnDevice": SFSpeechRecognizer(locale: locale)?.supportsOnDeviceRecognition ?? false,
            ])
            if command == "prepare" {
                let start = ProcessInfo.processInfo.systemUptime
                let newlyReserved = try await AssetInventory.reserve(locale: locale)
                emit("reservation", ["newlyReserved": newlyReserved])
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    emit("installation-request-returned")
                    let monitor = Task {
                        while !Task.isCancelled {
                            emit("download-progress", ["fraction": request.progress.fractionCompleted])
                            try? await Task.sleep(for: .seconds(2))
                        }
                    }
                    defer { monitor.cancel() }
                    try await request.downloadAndInstall()
                } else {
                    emit("no-installation-request")
                }
                emit("prepared", [
                    "elapsedMs": Int((ProcessInfo.processInfo.systemUptime - start) * 1000),
                    "status": String(describing: await AssetInventory.status(forModules: [transcriber])),
                ])
            } else if command == "mic" {
                try await recognizeMicrophone(transcriber)
            } else if command == "release" {
                emit("released", ["released": await AssetInventory.release(reservedLocale: locale)])
            } else if command == "stream" || command == "file" {
                guard CommandLine.arguments.count > 2 else {
                    throw NSError(domain: "TauASRProbe", code: 3, userInfo: [NSLocalizedDescriptionKey: "缺少音频文件路径"])
                }
                try await recognizeFile(CommandLine.arguments[2], paced: command == "stream", transcriber: transcriber,
                                        detectSpeech: !CommandLine.arguments.contains("--no-vad"))
            }
        } catch {
            let error = error as NSError
            emit("error", ["domain": error.domain, "code": error.code, "message": error.localizedDescription])
            exit(1)
        }
    }
}
