import { EventEmitter } from "events";
import path from "path";
import { app } from "electron";
import fs from "fs-extra";
import MediaUtil from "./MediaUtil";

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

// 转录结果
export interface TranscriptionResult {
  text: string;
  language: string;
  languageProbability: number;
  duration: number;
  processingTime: number;
  segments: TranscriptSegment[];
  wordSegments?: TranscriptSegment[];
}

export interface TranscriptSegment {
  text: string;
  start: number; // 毫秒
  end: number; // 毫秒
}

// 转录选项
export interface TranscriptionOptions {
  modelSize?:
    | "tiny"
    | "base"
    | "small"
    | "medium"
    | "large-v1"
    | "large-v2"
    | "large-v3";
  language?: string;
  device?: "cpu" | "cuda";
  computeType?: "int8" | "int16" | "float16" | "float32";
  wordTimestamps?: boolean;
  sentenceLevel?: boolean;
  useLLMOptimization?: boolean;
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

  private activeJobs: Map<string, Promise<TranscriptionResult>> = new Map();

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
  ): Promise<{ shouldSegment: boolean; duration: number }> {
    const duration = await MediaUtil.getMediaDuration(audioPath);
    return {
      shouldSegment: duration >= this.config.enableForMinDuration,
      duration,
    };
  }

  /**
   * 创建音频分段信息
   */
  async createSegments(
    _audioPath: string,
    totalDuration: number,
  ): Promise<AudioSegmentInfo[]> {
    const segmentDuration = this.config.segmentDurationMinutes * 60;
    const segments: AudioSegmentInfo[] = [];
    const tempDir = path.join(
      app.getPath("temp"),
      `transcription-${Date.now()}`,
    );
    await fs.ensureDir(tempDir);

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
  ): Promise<TranscriptionResult> {
    // 1. 提取所有音频分段
    onProgress(`准备音频分段 (0/${segments.length})...`);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      await MediaUtil.extractAudioSegmentForTranscription(
        originalAudioPath,
        segment.audioPath,
        segment.startTime,
        segment.duration,
      );
      onProgress(`已准备分段 ${i + 1}/${segments.length}`);
    }

    // 2. 并行处理转录（控制并发数）
    const pendingSegments = [...segments];
    const completedResults: Array<{
      index: number;
      result: TranscriptionResult;
    }> = [];

    const processNext = async (): Promise<void> => {
      while (
        pendingSegments.length > 0 &&
        this.activeJobs.size < this.config.maxConcurrency
      ) {
        const segment = pendingSegments.shift()!;
        segment.status = "processing";

        const job = (async () => {
          try {
            const result = await transcribeFunc(segment.audioPath, options);
            segment.status = "completed";
            segment.result = result;
            completedResults.push({ index: segment.segmentIndex, result });

            onProgress(
              `已转录 ${completedResults.length}/${segments.length} 个分段`,
            );

            return result;
          } catch (error) {
            segment.status = "failed";
            segment.error =
              error instanceof Error ? error.message : String(error);
            throw error;
          } finally {
            this.activeJobs.delete(segment.audioPath);
            // 继续处理下一个
            if (pendingSegments.length > 0) {
              await processNext();
            }
          }
        })();

        this.activeJobs.set(segment.audioPath, job);
      }
    };

    // 启动初始批次
    const initialBatch = Math.min(
      this.config.maxConcurrency,
      pendingSegments.length,
    );
    const promises: Promise<void>[] = [];
    for (let i = 0; i < initialBatch; i++) {
      promises.push(processNext());
    }

    // 等待所有任务完成
    await Promise.all([...this.activeJobs.values()]);

    // 3. 合并结果
    onProgress("合并转录结果...");
    const mergedResult = this.mergeResults(segments, completedResults);

    // 4. 清理临时文件
    await this.cleanup(segments);

    return mergedResult;
  }

  /**
   * 合并转录结果（处理时间偏移）
   */
  private mergeResults(
    segments: AudioSegmentInfo[],
    results: Array<{ index: number; result: TranscriptionResult }>,
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
      duration: segments[segments.length - 1].endTime,
      processingTime: results.reduce(
        (sum, r) => sum + r.result.processingTime,
        0,
      ),
      segments: mergedSegments,
      wordSegments:
        mergedWordSegments.length > 0 ? mergedWordSegments : undefined,
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
