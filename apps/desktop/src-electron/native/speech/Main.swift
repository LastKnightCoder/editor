import AVFoundation
import Foundation
import Darwin
import Speech

func output(_ event: String, _ fields: [String: Any] = [:]) {
    var record = fields
    record["event"] = event
    if let bytes = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(bytes)
        FileHandle.standardOutput.write(Data([10]))
    }
}

struct InputCommand: Decodable, Sendable {
    let type: String
    let seq: Int?
    let data: String?
}

func inputCommands() -> AsyncThrowingStream<InputCommand, Error> {
    let (stream, continuation) = AsyncThrowingStream<InputCommand, Error>.makeStream(bufferingPolicy: .bufferingOldest(16))
    Task.detached {
        do {
            var pending = Data()
            var buffer = [UInt8](repeating: 0, count: 65536)
            while true {
                let count = Darwin.read(STDIN_FILENO, &buffer, buffer.count)
                if count == 0 { break }
                if count < 0 {
                    if errno == EINTR { continue }
                    throw ProbeError.interrupted
                }
                pending.append(contentsOf: buffer.prefix(count))
                guard pending.count <= 1024 * 1024 else { throw ProbeError.invalidInput }
                while let newline = pending.firstIndex(of: 10) {
                    let line = Data(pending[..<newline])
                    pending.removeSubrange(...newline)
                    let command = try JSONDecoder().decode(InputCommand.self, from: line)
                    if case .dropped = continuation.yield(command) { throw ProbeError.invalidInput }
                    if command.type == "end" || command.type == "cancel" { continuation.finish(); return }
                }
            }
            continuation.finish(throwing: ProbeError.interrupted)
        } catch { continuation.finish(throwing: error) }
    }
    return stream
}

enum ProbeError: String, Error {
    case unavailable, needsAssets, invalidInput, interrupted, cancelled
}

@MainActor
func recognize(_ transcriber: SpeechTranscriber, language: String) async throws {
    guard await AssetInventory.status(forModules: [transcriber]) == .installed else { throw ProbeError.needsAssets }
    let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false)!
    let detector = SpeechDetector(detectionOptions: .init(sensitivityLevel: .medium), reportResults: true)
    let analyzer = SpeechAnalyzer(modules: [transcriber, detector])
    try await analyzer.prepareToAnalyze(in: format)
    let (input, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingOldest(16))
    final class Results {
        var confirmed: [[String: Any]] = []
        var pending = false
    }
    let detectionReader = Task { @MainActor in
        for try await _ in detector.results {}
    }
    let results = Results()
    let reader = Task { @MainActor in
        for try await result in transcriber.results {
            let index = results.confirmed.count
            let segment: [String: Any] = [
                "id": "native-\(index)", "text": String(result.text.characters), "final": result.isFinal,
                "startMs": Int(result.range.start.seconds * 1000), "endMs": Int(CMTimeRangeGetEnd(result.range).seconds * 1000),
            ]
            output("update", ["startIndex": index, "deleteCount": results.pending ? 1 : 0, "segments": [segment]])
            results.pending = !result.isFinal
            if result.isFinal { results.confirmed.append(segment) }
        }
    }
    do {
        try await analyzer.start(inputSequence: input)
        output("ready")
        var sequence = 0
        var samples: Int64 = 0
        var ended = false
        for try await command in inputCommands() {
            if command.type == "cancel" { throw ProbeError.cancelled }
            if command.type == "end" { ended = true; break }
            guard command.type == "audio", command.seq == sequence,
                  let encoded = command.data, let data = Data(base64Encoded: encoded),
                  data.count > 0, data.count <= 64000, data.count % 2 == 0 else { throw ProbeError.invalidInput }
            let frames = AVAudioFrameCount(data.count / 2)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
            buffer.frameLength = frames
            data.withUnsafeBytes { bytes in
                buffer.int16ChannelData!.pointee.update(from: bytes.bindMemory(to: Int16.self).baseAddress!, count: Int(frames))
            }
            let packet = AnalyzerInput(buffer: buffer, bufferStartTime: CMTime(value: samples, timescale: 16000))
            if case .enqueued = continuation.yield(packet) {} else { throw ProbeError.invalidInput }
            sequence += 1
            samples += Int64(frames)
        }
        guard ended else { throw ProbeError.interrupted }
        continuation.finish()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        try await reader.value
        try await detectionReader.value
        output("result", ["transcript": [
            "text": results.confirmed.compactMap { $0["text"] as? String }.joined(),
            "segments": results.confirmed, "language": language, "durationMs": Int(samples * 1000 / 16000),
        ]])
    } catch {
        continuation.finish()
        await analyzer.cancelAndFinishNow()
        reader.cancel()
        detectionReader.cancel()
        _ = try? await reader.value
        _ = try? await detectionReader.value
        throw error
    }
}

@main
struct NativeSpeech {
    static func main() async {
        let command = CommandLine.arguments.dropFirst().first ?? "probe"
        let deadline = command == "prepare" ? 600 : (command == "recognize" ? 150 : 15)
        let watchdog = Task.detached {
            try? await Task.sleep(for: .seconds(deadline))
            if !Task.isCancelled { output("error", ["code": "timeout", "message": "系统语音识别等待超时"]); exit(2) }
        }
        defer { watchdog.cancel() }
        do {
            let requested = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "zh-CN"
            guard SpeechTranscriber.isAvailable,
                  let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: requested)) else {
                output("availability", ["state": "unsupported", "reason": "当前系统或语言不支持原生识别"])
                return
            }
            let transcriber = SpeechTranscriber(locale: locale, preset: .timeIndexedProgressiveTranscription)
            if command == "probe" {
                let status = await AssetInventory.status(forModules: [transcriber])
                output("availability", ["state": status == .installed ? "ready" : "needs-assets", "locale": locale.identifier])
            } else if command == "prepare" {
                try await AssetInventory.reserve(locale: locale)
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    output("preparing")
                    try await request.downloadAndInstall()
                }
                guard await AssetInventory.status(forModules: [transcriber]) == .installed else { throw ProbeError.needsAssets }
                output("availability", ["state": "ready", "locale": locale.identifier])
            } else if command == "recognize" {
                try await recognize(transcriber, language: locale.identifier.replacingOccurrences(of: "_", with: "-"))
            } else { throw ProbeError.invalidInput }
        } catch {
            output("error", ["code": (error as? ProbeError)?.rawValue ?? "internal", "message": "系统语音识别未完成，请重试或检查语言资源", "domain": (error as NSError).domain, "nativeCode": (error as NSError).code])
            exit(1)
        }
    }
}
