import { createReadStream, createWriteStream } from "node:fs";
import { stat, mkdtemp, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import os from "node:os";
import {
  createASRTask,
  throwIfASRAborted,
  type ASRAudioFile,
  type ASRAvailability,
  type ASRFileRequest,
  type ASRInstance,
  type ASRProbeRequest,
  type ASRRunOptions,
  type ASRTranscript,
} from "@tau/asr";
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionService,
} from "./whisper-engine";

const localFiles = new WeakMap<ASRAudioFile, string>();
export async function localASRAudioFile(filePath: string): Promise<ASRAudioFile> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("识别来源不是文件");
  const file: ASRAudioFile = {
    name: path.basename(filePath),
    mimeType: "application/octet-stream",
    sizeBytes: info.size,
    async open(signal) {
      throwIfASRAborted(signal);
      return Readable.toWeb(
        createReadStream(filePath, { signal, highWaterMark: 65536 })
      ) as ReadableStream<Uint8Array>;
    },
  };
  localFiles.set(file, filePath);
  return file;
}

/** 存量媒体调用仍消费原始字段，统一结果只提供识别事实，不把推断置信度当作模型报告。 */
export interface LocalFileTranscript extends ASRTranscript {
  sourceResult: TranscriptionResult;
}
export function createLocalFileASR(engine: TranscriptionService, config: TranscriptionOptions) {
  const settings = Object.freeze({ ...config });
  return {
    async probe(request: ASRProbeRequest, signal: AbortSignal): Promise<ASRAvailability> {
      throwIfASRAborted(signal);
      const capabilities = {
        execution: "device" as const,
        textUpdates: "final-only" as const,
        timestamps:
          settings.output === "text"
            ? ("none" as const)
            : settings.useLLMOptimization ||
                settings.wordTimestamps ||
                settings.sentenceLevel === false
              ? ("word" as const)
              : ("segment" as const),
        speakerLabels: false,
      };
      if (request.input !== "file")
        return { ...capabilities, state: "unsupported", reason: "本地引擎只支持文件转录" };
      let available: boolean;
      if (settings.engine === "qwen") {
        const { qwenSupported, qwenPlatformRequirement } = await import("./qwen/runtime");
        if (!qwenSupported())
          return {
            ...capabilities,
            state: "unsupported",
            reason: qwenPlatformRequirement,
          };
        const { missingQwenAsset } = await import("./qwen/assets");
        available = !(await missingQwenAsset(
          engine.getModelsDir(),
          settings.qwenModel ?? "1.7B",
          settings.output !== "text",
          settings.qwenDevice
        ));
      } else
        available =
          (await engine.hasPrecompiledProgram()) &&
          (await engine.isModelDownloaded(settings.modelSize ?? "base"));
      throwIfASRAborted(signal);
      return { ...capabilities, state: available ? "ready" : "needs-assets" };
    },
    async transcribeFile(request: ASRFileRequest, options: ASRRunOptions) {
      return createASRTask<LocalFileTranscript>(options, async (signal, emit) => {
        let temporary: string | undefined;
        try {
          let filePath = localFiles.get(request.audio);
          if (!filePath) {
            temporary = await mkdtemp(path.join(os.tmpdir(), "tau-asr-source-"));
            filePath = path.join(temporary, "audio");
            const stream = await request.audio.open(signal);
            await pipeline(
              Readable.fromWeb(stream as unknown as NodeReadableStream<Uint8Array>),
              createWriteStream(filePath),
              { signal }
            );
          }
          throwIfASRAborted(signal);
          const sourceResult = await engine.transcribe(
            filePath,
            { ...settings, language: request.language },
            progress => {
              const { stage, ...data } = progress;
              emit({ type: "progress", stage: stage ?? "recognizing", ...data });
            },
            signal
          );
          return {
            text: sourceResult.text,
            language: sourceResult.language,
            segments: sourceResult.segments.map((segment, index) => ({
              id: `${options.taskId}:${index}`,
              text: segment.text,
              final: true,
              startMs: segment.start,
              endMs: segment.end,
            })),
            words: sourceResult.wordSegments?.map(word => ({
              text: word.text,
              startMs: word.start,
              endMs: word.end,
            })),
            sourceResult,
          };
        } finally {
          if (temporary) await rm(temporary, { recursive: true, force: true });
        }
      });
    },
  } satisfies ASRInstance;
}
