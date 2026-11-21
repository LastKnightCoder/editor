export type LocalTranscriptionEngine = "whisper" | "qwen";
export type QwenDevice = "cpu" | "gpu";
export interface QwenHardwareReport {
  state: "verified" | "candidate" | "cpu" | "unknown";
  /** 已验证设备按转录优先顺序排列；其他状态保留 Windows 报告的名称。 */
  names: string[];
}

export function recommendedQwenDevice(report: QwenHardwareReport): QwenDevice {
  return report.state === "verified" || report.state === "candidate" ? "gpu" : "cpu";
}
export type QwenModel = "0.6B" | "1.7B";

export interface LocalTranscriptionSelection {
  engine: LocalTranscriptionEngine;
  currentModel: string;
  qwenModel: QwenModel;
  qwenDevice: QwenDevice;
  output: "text" | "subtitles";
  optimize: boolean;
  keepWords: boolean;
}

export type EngineOptions = {
  engine?: LocalTranscriptionEngine;
  qwenModel?: QwenModel;
  qwenDevice?: QwenDevice;
  output?: LocalTranscriptionSelection["output"];
};

export function qwenRuntimeId(device: QwenDevice) {
  return "qwen3-runtime-" + device;
}
export function qwenRuntimeDevice(id: string): QwenDevice | undefined {
  if (id === qwenRuntimeId("cpu")) return "cpu";
  if (id === qwenRuntimeId("gpu")) return "gpu";
}

export const qwenAlignerId = "qwen3-forcedaligner-0.6b";
export function qwenModelId(size: QwenModel) {
  return size === "0.6B" ? "qwen3-asr-0.6b" : "qwen3-asr-1.7b";
}

export function transcriptionDefaults(
  saved: Partial<LocalTranscriptionSelection> = {},
  legacy?: { segmentationLevel?: string; useLLMOptimization?: boolean }
): LocalTranscriptionSelection {
  return {
    engine: saved.engine ?? "whisper",
    currentModel: saved.currentModel || "faster-whisper-base",
    qwenModel: saved.qwenModel ?? "1.7B",
    qwenDevice: saved.qwenDevice ?? "cpu",
    output: saved.output ?? "subtitles",
    optimize:
      saved.optimize ?? (legacy?.segmentationLevel === "word" && !!legacy.useLLMOptimization),
    keepWords: saved.keepWords ?? legacy?.segmentationLevel === "word",
  };
}

export function localTranscriptionOptions(selection: LocalTranscriptionSelection) {
  const subtitles = selection.output === "subtitles";
  const useLLMOptimization = subtitles && selection.optimize;
  const wordTimestamps = subtitles && (selection.keepWords || useLLMOptimization);
  return {
    language: "auto",
    engine: selection.engine,
    qwenModel: selection.qwenModel,
    qwenDevice: selection.qwenDevice,
    output: selection.output,
    modelSize: selection.currentModel.replace(/^(faster-whisper|whisper-cpp)-/, "") as
      | "tiny"
      | "base"
      | "small"
      | "medium"
      | "large-v1"
      | "large-v2"
      | "large-v3",
    useLLMOptimization,
    wordTimestamps,
    sentenceLevel: !wordTimestamps,
  };
}

export const qwenAlignedLanguages = new Set([
  "zh",
  "en",
  "yue",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
  "es",
]);

export function selectedModelId(
  value: LocalTranscriptionSelection,
  models: readonly { name: string }[]
) {
  if (value.engine === "qwen") return qwenModelId(value.qwenModel);
  const size = value.currentModel.replace(/^(faster-whisper|whisper-cpp)-/, "");
  return (
    models.find(m => m.name === "whisper-cpp-" + size || m.name === "faster-whisper-" + size)
      ?.name ?? value.currentModel
  );
}

export function requiredModels(
  value: LocalTranscriptionSelection,
  models: readonly { name: string }[]
) {
  const ids = [selectedModelId(value, models)];
  if (value.engine === "qwen" && value.output === "subtitles") ids.push(qwenAlignerId);
  if (value.engine === "qwen" && models.some(model => model.name === qwenRuntimeId("cpu")))
    ids.unshift(qwenRuntimeId(value.qwenDevice));
  return ids;
}
