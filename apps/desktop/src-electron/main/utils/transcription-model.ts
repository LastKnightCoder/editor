/**
 * 转录模型名 → 模型尺寸。设置里存的是带引擎前缀的模型名
 * （Windows：faster-whisper-base，macOS：whisper-cpp-base），引擎只认尺寸（base）。
 */
export function normalizeModelSize(model?: string | null): string {
  const size = model?.trim().replace(/^(faster-whisper|whisper-cpp)-/, "");
  return size || "base";
}

/** whisper.cpp --dtw 支持的对齐头预设（与 ggml 模型尺寸一一对应） */
const WHISPER_DTW_PRESETS = new Set([
  "tiny",
  "base",
  "small",
  "medium",
  "large.v1",
  "large.v2",
  "large.v3",
  "large.v3.turbo",
]);

/** 模型尺寸 → whisper.cpp --dtw 预设名（large-v3 → large.v3）；不支持的尺寸返回 null */
export function whisperDtwPreset(modelSize?: string | null): string | null {
  const preset = normalizeModelSize(modelSize).replace(/-/g, ".");
  return WHISPER_DTW_PRESETS.has(preset) ? preset : null;
}
