import type { TranscriptionProgress } from "../../../../shared/media-progress";
import fs from "fs-extra";
import type { QwenDevice } from "../../../../shared/local-transcription";
import path from "node:path";
import { throwIfASRAborted } from "@tau/asr";
import MediaUtil from "../../utils/MediaUtil";
import { ASRProcessExitError, runASRProcess } from "../asr-process";
import { probeVulkanDevices } from "./hardware";
import { nativeSubtitles } from "./windows-output";
import type { TranscriptionResult } from "../whisper-engine";
import { qwenExecutable } from "./runtime";

async function probeGpu(signal: AbortSignal) {
  try {
    const [gpu] = await probeVulkanDevices(signal);
    if (gpu) return gpu;
  } catch {
    signal.throwIfAborted();
  }
  throw new Error("未检测到可用的 Vulkan GPU。请更新显卡驱动，或在转录设置中选择 CPU。");
}

export async function transcribeWindows(
  input: string,
  model: string,
  aligner: string | undefined,
  language: string,
  device: QwenDevice,
  signal: AbortSignal,
  progress?: (progress: TranscriptionProgress) => void
): Promise<TranscriptionResult> {
  const dir = path.dirname(input);
  const transcript = path.join(dir, "transcript.txt");
  const aligned = path.join(dir, "words.json");
  const executable = qwenExecutable(device);
  const gpu = device === "gpu" ? await probeGpu(signal) : undefined;
  const args = [
    "--task",
    "asr",
    "--family",
    "qwen3_asr",
    "--backend",
    gpu ? "vulkan" : "cpu",
    "--model",
    model,
    "--audio",
    input,
    "--text",
    "",
    "--text-out",
    transcript,
    "--audio-chunk-mode",
    "fixed",
  ];
  if (gpu) args.push("--device", String(gpu.index));
  if (language !== "auto")
    args.push(
      "--language",
      new Intl.DisplayNames("en", { type: "language" }).of(language) ?? language
    );
  if (aligner)
    args.push(
      "--words-out",
      aligned,
      "--session-option",
      "qwen3_asr.forced_aligner_path=" + aligner,
      "--request-option",
      "preserve_punctuation=true",
      "--request-option",
      "trim_chunk_overlap=true",
      "--request-option",
      "clamp_timestamps_to_audio=true"
    );
  const duration = await MediaUtil.getMediaDuration(input, signal);
  progress?.(
    gpu
      ? {
          message: "正在使用 " + gpu.description + " 转录…",
          code: "transcription.gpu",
          params: { device: gpu.description },
          stage: "recognizing",
        }
      : { message: "正在使用 Qwen 在本机转录…", code: "transcription.qwen", stage: "recognizing" }
  );
  try {
    await runASRProcess(executable, args, signal, progress);
  } catch (error) {
    if (gpu && error instanceof ASRProcessExitError)
      throw new Error(error.message + "。请检查显卡驱动及可用显存，或选择 CPU 重试。", {
        cause: error,
      });
    throw error;
  }
  const text = (await fs.readFile(transcript, "utf8")).trim();
  const times =
    aligner && text
      ? nativeSubtitles(await fs.readJson(aligned), text, duration)
      : { segments: [] };
  throwIfASRAborted(signal);
  return {
    text,
    ...times,
    language: language === "auto" ? "und" : language,
    duration,
    processingTime: 0,
  };
}
