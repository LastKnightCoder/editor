import { ipcMain, app } from "electron";
import path from "path";
import { randomUUID } from "node:crypto";
import { ASRError, throwIfASRAborted } from "@tau/asr";
import { createWhisperASR, localASRAudioFile } from "../services/asr-whisper";
import { ASRTaskRegistry } from "../services/asr-tasks";
import database from "./database";
import fs from "fs-extra";
import { Module } from "../types/module";
import MediaUtil from "../utils/MediaUtil";
import { TranscriptionQueueManager } from "../utils/TranscriptionQueueManager";
import {
  TranscriptionService,
  AVAILABLE_MODELS,
  type TranscriptionOptions,
  type TranscriptionResult,
} from "../services/whisper-engine";
export type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from "../services/whisper-engine";
export { AVAILABLE_MODELS } from "../services/whisper-engine";

// ==================== 模块定义 ====================

/** 共享转录服务实例（markitdown 等模块复用） */
export const transcriptionService = new TranscriptionService();

class TranscriptionModule implements Module {
  name: string;
  private service: TranscriptionService;
  private queueManager: TranscriptionQueueManager;
  private tasks = new ASRTaskRegistry();

  constructor() {
    this.name = "transcription";
    this.service = transcriptionService;
    this.queueManager = new TranscriptionQueueManager();
  }

  async init() {
    database.onDatabaseChange(() => this.tasks.cancelAll());
    app.on("quit", () => this.tasks.cancelAll());
    ipcMain.handle("transcription-cancel", (event, id: string) =>
      this.tasks.cancel(event.sender.id, id)
    );
    ipcMain.handle(
      "transcribe-audio",
      async (event, audioPath: string, options: TranscriptionOptions, taskId: string) => {
        try {
          const data = await this.tasks.run(event.sender, taskId, signal =>
            this.runFile(
              audioPath,
              options,
              signal,
              message => {
                if (!signal.aborted && !event.sender.isDestroyed())
                  event.sender.send("transcription-progress", { taskId, message });
              },
              taskId
            )
          );
          return { success: true, data };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            errorCode: error instanceof ASRError ? error.code : "internal",
          };
        }
      }
    );

    // 获取可用模型列表
    ipcMain.handle("transcription-get-models", async () => {
      const downloadedModels = await this.service.getDownloadedModels();
      return AVAILABLE_MODELS.map(model => ({
        ...model,
        downloaded: downloadedModels.includes(model.name),
      }));
    });

    // 检查模型是否已下载
    ipcMain.handle("transcription-check-model", async (_event, modelName: string) => {
      return this.service.isModelDownloaded(modelName);
    });

    // 获取已下载的模型
    ipcMain.handle("transcription-get-downloaded-models", async () => {
      return this.service.getDownloadedModels();
    });

    // 获取模型目录
    ipcMain.handle("transcription-get-models-dir", () => {
      return this.service.getModelsDir();
    });

    // 打开模型目录
    ipcMain.handle("transcription-open-models-dir", async () => {
      await this.service.openModelsDir();
    });

    // 从视频中提取音频
    ipcMain.handle("transcription-extract-audio-from-video", async (event, videoPath: string) => {
      try {
        // 验证视频文件存在
        if (!(await fs.pathExists(videoPath))) {
          return {
            success: false,
            error: `Video file not found: ${videoPath}`,
          };
        }

        // 生成临时音频文件路径
        const outputPath = path.join(app.getPath("temp"), `audio-${Date.now()}.mp3`);

        // 提取音频
        await MediaUtil.extractAudioFromVideo(videoPath, outputPath, progress => {
          event.sender.send("transcription-extract-audio-progress", {
            progress,
          });
        });

        return { success: true, audioPath: outputPath };
      } catch (error) {
        console.error("[Transcription] Extract audio error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 获取音频时长
    ipcMain.handle("transcription-get-audio-duration", async (_event, audioPath: string) => {
      try {
        const duration = await MediaUtil.getMediaDuration(audioPath);
        return { success: true, duration };
      } catch (error) {
        console.error("[Transcription] Get duration error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 检查是否需要分段转录
    ipcMain.handle("transcription-should-segment", async (_event, audioPath: string) => {
      try {
        const result = await this.queueManager.shouldSegmentAudio(audioPath);
        return { success: true, ...result };
      } catch (error) {
        console.error("[Transcription] Check segment error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle(
      "transcription-transcribe-segmented",
      async (event, audioPath: string, options: TranscriptionOptions, taskId: string) => {
        try {
          const data = await this.tasks.run(event.sender, taskId, async signal => {
            const progress = (message: string) => {
              if (!signal.aborted && !event.sender.isDestroyed())
                event.sender.send("transcription-progress", { taskId, message });
            };
            const { shouldSegment, duration } = await this.queueManager.shouldSegmentAudio(
              audioPath,
              signal
            );
            throwIfASRAborted(signal);
            if (!shouldSegment) return this.runFile(audioPath, options, signal, progress, taskId);
            const segments = await this.queueManager.createSegments(audioPath, duration);
            return this.queueManager.processQueue(
              audioPath,
              segments,
              options,
              (segmentPath, segmentOptions, segmentSignal) =>
                this.runFile(segmentPath, segmentOptions, segmentSignal),
              progress,
              signal
            );
          });
          return { success: true, data };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            errorCode: error instanceof ASRError ? error.code : "internal",
          };
        }
      }
    );
  }

  private async runFile(
    audioPath: string,
    options: TranscriptionOptions,
    signal: AbortSignal,
    onProgress?: (message: string) => void,
    taskId: string = randomUUID()
  ): Promise<TranscriptionResult> {
    const provider = createWhisperASR(this.service, options);
    const audio = await localASRAudioFile(audioPath);
    throwIfASRAborted(signal);
    const task = await provider.transcribeFile(
      { audio, language: options.language ?? "auto" },
      {
        taskId,
        signal,
        onEvent: event => {
          if (event.type === "progress" && event.message) onProgress?.(event.message);
        },
      }
    );
    return (await task.result).sourceResult;
  }

  getModelsDir(): string {
    return this.service.getModelsDir();
  }

  /**
   * 从视频中提取音频（供其他模块直接调用）
   */
  async extractAudioFromVideo(
    videoPath: string
  ): Promise<{ success: boolean; audioPath?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const outputPath = path.join(app.getPath("temp"), `audio-extract-${timestamp}.wav`);

      await MediaUtil.extractAudioFromVideo(videoPath, outputPath);

      return { success: true, audioPath: outputPath };
    } catch (error) {
      console.error("[Transcription] Extract audio error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 转录音频（供其他模块直接调用）
   */
  async transcribeAudio(
    audioPath: string,
    options: TranscriptionOptions = {},
    onProgress?: (message: string) => void
  ): Promise<{
    success: boolean;
    data?: TranscriptionResult;
    error?: string;
  }> {
    try {
      const result = await this.runFile(
        audioPath,
        options,
        new AbortController().signal,
        onProgress
      );
      return { success: true, data: result };
    } catch (error) {
      console.error("[Transcription] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export default new TranscriptionModule();
