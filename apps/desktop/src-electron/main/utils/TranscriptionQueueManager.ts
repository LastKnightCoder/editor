import { EventEmitter } from "events";
import path from "path";
import { app } from "electron";
import fs from "fs-extra";
import MediaUtil from "./MediaUtil";
import { asrAbortError, throwIfASRAborted } from "@tau/asr";
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment as TranscriptSegment,
} from "../services/whisper-engine";
export type { TranscriptionOptions, TranscriptionResult } from "../services/whisper-engine";

// 音频分段信息
export interface AudioSegmentInfo {
  segmentIndex: number; // 分段序号
  startTime: number; // 开始时间（秒）
  endTime: number; // 结束时间（秒）
  duration: number; // 持续时间（秒）
  audioPath: string; // 临时音频文件路径
  status: "pending" | "processing" | "completed" | "failed";
  result?: TranscriptionResult;
  error?: string;
}

// 队列配置
export interface TranscriptionQueueConfig {
  segmentDurationMinutes: number; // 每段时长（分钟）
  maxConcurrency: number; // 最大并行数
  enableForMinDuration: number; // 启用分段的最小时长（秒）
}

// 转录函数类型
export type TranscribeFunction = (
  audioPath: string,
  options: TranscriptionOptions,
  signal: AbortSignal
) => Promise<TranscriptionResult>;

/**
 * 转录队列管理器
 * 用于管理长视频的分段转录
 */
export class TranscriptionQueueManager extends EventEmitter {
  private config: TranscriptionQueueConfig = {
    segmentDurationMinutes: 20, // 每段 20 分钟
    maxConcurrency: 2, // 最多并行 2 个
    enableForMinDuration: 30 * 60, // 30 分钟阈值
  };

  constructor(config?: Partial<TranscriptionQueueConfig>) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * 检查是否需要分段转录
   */
  async shouldSegmentAudio(
    audioPath: string,
    signal?: AbortSignal
  ): Promise<{ shouldSegment: boolean; duration: number }> {
    const duration = await MediaUtil.getMediaDuration(audioPath, signal);
    return {
      shouldSegment: duration >= this.config.enableForMinDuration,
      duration,
    };
  }

  /**
   * 创建音频分段信息
   */
  async createSegments(_audioPath: string, totalDuration: number): Promise<AudioSegmentInfo[]> {
    const segmentDuration = this.config.segmentDurationMinutes * 60;
    const segments: AudioSegmentInfo[] = [];
    const tempDir = await fs.mkdtemp(path.join(app.getPath("temp"), "transcription-"));

    let currentTime = 0;
    let segmentIndex = 0;

    while (currentTime < totalDuration) {
      const duration = Math.min(segmentDuration, totalDuration - currentTime);
      const segmentPath = path.join(tempDir, `segment-${segmentIndex}.mp3`);

      segments.push({
        segmentIndex,
        startTime: currentTime,
        endTime: currentTime + duration,
        duration,
        audioPath: segmentPath,
        status: "pending",
      });

      currentTime += duration;
      segmentIndex++;
    }

    return segments;
  }

  /**
   * 处理转录队列
   */
  async processQueue(
    originalAudioPath: string,
    segments: AudioSegmentInfo[],
    options: TranscriptionOptions,
    transcribeFunc: TranscribeFunction,
    onProgress: (message: string) => void,
    signal = new AbortController().signal
  ): Promise<TranscriptionResult> {
    const lifetime = new AbortController();
    const abort = () => lifetime.abort(asrAbortError());
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const completedResults: Array<{ index: number; result: TranscriptionResult }> = [];
    let next = 0;
    let failure: unknown;
    try {
      throwIfASRAborted(lifetime.signal);
      onProgress(`准备音频分段 (0/${segments.length})...`);
      for (const segment of segments) {
        throwIfASRAborted(lifetime.signal);
        await MediaUtil.extractAudioSegmentForTranscription(
          originalAudioPath,
          segment.audioPath,
          segment.startTime,
          segment.duration,
          undefined,
          lifetime.signal
        );
        onProgress(`已准备分段 ${segment.segmentIndex + 1}/${segments.length}`);
      }
      const worker = async () => {
        while (next < segments.length && !lifetime.signal.aborted) {
          const segment = segments[next++];
          segment.status = "processing";
          try {
            const result = await transcribeFunc(segment.audioPath, options, lifetime.signal);
            throwIfASRAborted(lifetime.signal);
            segment.status = "completed";
            segment.result = result;
            completedResults.push({ index: segment.segmentIndex, result });
            onProgress(`已转录 ${completedResults.length}/${segments.length} 个分段`);
          } catch (error) {
            segment.status = "failed";
            failure ??= error;
            abort();
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(this.config.maxConcurrency, segments.length) }, worker)
      );
      if (failure) throw failure;
      throwIfASRAborted(lifetime.signal);
      onProgress("合并转录结果...");
      return this.mergeResults(segments, completedResults);
    } finally {
      signal.removeEventListener("abort", abort);
      await this.cleanup(segments);
    }
  }

  /**
   * 合并转录结果（处理时间偏移）
   */
  private mergeResults(
    segments: AudioSegmentInfo[],
    results: Array<{ index: number; result: TranscriptionResult }>
  ): TranscriptionResult {
    // 按分段索引排序
    results.sort((a, b) => a.index - b.index);

    const mergedSegments: TranscriptSegment[] = [];
    const mergedWordSegments: TranscriptSegment[] = [];
    let fullText = "";

    for (const { index, result } of results) {
      const segment = segments[index];
      const timeOffset = segment.startTime * 1000; // 转换为毫秒

      // 调整句级时间戳
      for (const seg of result.segments) {
        mergedSegments.push({
          text: seg.text,
          start: seg.start + timeOffset,
          end: seg.end + timeOffset,
        });
      }

      // 调整词级时间戳
      if (result.wordSegments) {
        for (const wordSeg of result.wordSegments) {
          mergedWordSegments.push({
            text: wordSeg.text,
            start: wordSeg.start + timeOffset,
            end: wordSeg.end + timeOffset,
          });
        }
      }

      fullText += (fullText ? " " : "") + result.text;
    }

    return {
      text: fullText,
      language: results[0]?.result.language || "zh",
      languageProbability: results[0]?.result.languageProbability || 1,
      duration: segments.at(-1)?.endTime ?? 0,
      processingTime: results.reduce((sum, r) => sum + r.result.processingTime, 0),
      segments: mergedSegments,
      wordSegments: mergedWordSegments.length > 0 ? mergedWordSegments : undefined,
    };
  }

  /**
   * 清理临时文件
   */
  async cleanup(segments: AudioSegmentInfo[]): Promise<void> {
    for (const segment of segments) {
      await fs.remove(segment.audioPath).catch(() => {});
    }
    // 删除临时目录
    if (segments.length > 0) {
      const tempDir = path.dirname(segments[0].audioPath);
      await fs.remove(tempDir).catch(() => {});
    }
  }
}

export default TranscriptionQueueManager;
