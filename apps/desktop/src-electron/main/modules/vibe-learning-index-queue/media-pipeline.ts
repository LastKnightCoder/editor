import { promises as fs } from "fs";
import log from "electron-log";
import databaseModule from "../database";
import transcriptionModule, { type TranscriptionResult } from "../transcription";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import vibeLearningMediaCache, { hashPayload, hashString } from "../vibe-learning-media-cache";
import {
  buildVLTranscriptionOptions,
  resolveVLOptimizationLanguage,
  type VLTranscriptionModelSize,
} from "../vibe-learning-transcription";
import { TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT } from "@/constants/prompts/transcription-optimization";
import type { VibeLearningIndexQueue } from "./index";
import { optimizeTranscriptionWithLLM } from "./transcription-optimization";
import { formatTimestamp, isAudioFile } from "./utils";

/**
 * 将转录 segments 格式化为带时间戳的 Markdown
 */
export function formatSegmentsToMarkdown(
  title: string,
  segments: Array<{ text: string; start: number; end: number }>,
  videoUrl?: string
): string {
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  if (videoUrl) {
    lines.push(`> 视频: ${videoUrl}`);
    lines.push("");
  }
  lines.push("## 转录内容");
  lines.push("");

  for (const segment of segments) {
    const time = formatTimestamp(segment.start);
    lines.push(`**[${time}]** ${segment.text}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 统一媒体处理管线
 * 所有视频/音频资源（在线视频、本地、远程等）获取到本地文件后统一走此方法
 */
export async function processMediaResource(
  manager: VibeLearningIndexQueue,
  localFilePath: string,
  resourceId: number,
  resourceName: string,
  mainDbName: string,
  sourceStableId: string,
  videoUrl?: string
): Promise<string> {
  const isAudioResource = isAudioFile(localFilePath);
  let audioPath = localFilePath;
  let tempAudioPath: string | null = null;

  const mediaFingerprint = await vibeLearningMediaCache
    .computeMediaFingerprint(localFilePath, sourceStableId)
    .catch(error => {
      log.warn(
        `[VibeLearningIndexQueue] Failed to compute media fingerprint, fallback to path hash: ${error}`
      );
      return `fallback:${hashString(localFilePath)}`;
    });

  // 1. 提取音频（仅视频需要）
  manager.processingStatus.set(resourceId, "converting");
  manager.emit("status-change", resourceId, "converting");

  if (!isAudioResource) {
    const audioKey = vibeLearningMediaCache.buildAudioKey({
      sourceStableId,
      mediaFingerprint,
    });
    const cachedAudioPath = await vibeLearningMediaCache.getAudioPath(audioKey);

    if (cachedAudioPath) {
      audioPath = cachedAudioPath;
      log.info(`[VibeLearningIndexQueue] Hit audio cache for resource ${resourceId}`);
    } else {
      const audioResult = await transcriptionModule.extractAudioFromVideo(localFilePath);
      if (!audioResult.success || !audioResult.audioPath) {
        throw new Error(audioResult.error || "提取音频失败");
      }

      tempAudioPath = audioResult.audioPath;
      audioPath = tempAudioPath;

      try {
        audioPath = await vibeLearningMediaCache.cacheAudioFromFile(audioKey, tempAudioPath);
        log.info(`[VibeLearningIndexQueue] Stored audio cache for resource ${resourceId}`);
      } catch (error) {
        log.warn(
          `[VibeLearningIndexQueue] Failed to cache extracted audio, fallback to temp file: ${error}`
        );
      }
    }
  }

  try {
    // 2. 转录
    manager.processingStatus.set(resourceId, "transcribing");
    manager.emit("status-change", resourceId, "transcribing");

    const transcriptionConfig = await manager.getTranscriptionConfig();
    const optimizationLlm = transcriptionConfig?.llm ?? null;
    const hasLLMConfig = optimizationLlm !== null;

    const modelSize: VLTranscriptionModelSize =
      (transcriptionConfig?.model as VLTranscriptionModelSize) || "base";
    const transcriptionOptions = buildVLTranscriptionOptions(modelSize, hasLLMConfig);
    const { language, sentenceLevel, useLLMOptimization } = transcriptionOptions;

    log.info(
      `[VibeLearningIndexQueue] Transcribing media: model=${modelSize}, hasLLM=${hasLLMConfig}`
    );

    const transcriptionKey = vibeLearningMediaCache.buildTranscriptionKey({
      sourceStableId,
      mediaFingerprint,
      modelSize,
      language,
      sentenceLevel,
      useLLMOptimization,
    });

    let transcriptionData =
      await vibeLearningMediaCache.readTranscription<TranscriptionResult>(transcriptionKey);

    if (transcriptionData) {
      log.info(`[VibeLearningIndexQueue] Hit transcription cache for resource ${resourceId}`);
    } else {
      const transcriptionResult = await transcriptionModule.transcribeAudio(
        audioPath,
        transcriptionOptions,
        (msg: string) => {
          const match = msg.match(/(\d+)%/);
          if (match) {
            manager.sendStatusWithProgress(resourceId, "transcribing", {
              total: 100,
              completed: parseInt(match[1]),
              failed: 0,
              inProgress: 1,
            });
          }
        }
      );

      if (!transcriptionResult.success || !transcriptionResult.data) {
        throw new Error(transcriptionResult.error || "转录失败");
      }
      transcriptionData = transcriptionResult.data;

      try {
        await vibeLearningMediaCache.writeTranscription(transcriptionKey, transcriptionData);
      } catch (error) {
        log.warn(`[VibeLearningIndexQueue] Failed to write transcription cache: ${error}`);
      }
    }

    // 3. LLM 优化（如果配置了）
    const { text, segments, wordSegments } = transcriptionData;
    const rawSegments = wordSegments || segments || [];
    const optimizationLanguage = resolveVLOptimizationLanguage(transcriptionData.language);

    const db = databaseModule.getDatabase(mainDbName);
    if (db && rawSegments.length > 0) {
      VibeLearningResourceTable.updateTranscriptSegments(db, resourceId, rawSegments);
    }

    let finalSegments: Array<{
      text: string;
      start: number;
      end: number;
    }>;

    if (optimizationLlm) {
      if (rawSegments.length === 0) {
        throw new Error("无可用词级时间戳，无法进行断句优化");
      }

      const optimizationKey = vibeLearningMediaCache.buildOptimizationKey({
        transcriptionKey,
        llmProvider: optimizationLlm.providerId,
        llmModel: optimizationLlm.modelId,
        llmBaseUrl: "",
        promptHash: hashString(TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT),
        wordSegmentsHash: hashPayload({ rawSegments }),
      });

      const cachedOptimized =
        await vibeLearningMediaCache.readOptimization<
          Array<{ text: string; start: number; end: number }>
        >(optimizationKey);

      if (cachedOptimized) {
        finalSegments = cachedOptimized;
        manager.processingStatus.set(resourceId, "optimizing_transcript");
        manager.emit("status-change", resourceId, "optimizing_transcript");
        log.info(`[VibeLearningIndexQueue] Hit optimization cache for resource ${resourceId}`);
      } else {
        manager.processingStatus.set(resourceId, "optimizing_transcript");
        manager.emit("status-change", resourceId, "optimizing_transcript");

        finalSegments = await optimizeTranscriptionWithLLM(
          rawSegments,
          optimizationLanguage,
          { llm: optimizationLlm, library: mainDbName, entityId: String(resourceId) },
          progress => {
            manager.sendStatusWithProgress(resourceId, "optimizing_transcript", progress);
          }
        );

        try {
          await vibeLearningMediaCache.writeOptimization(optimizationKey, finalSegments);
        } catch (error) {
          log.warn(`[VibeLearningIndexQueue] Failed to write optimization cache: ${error}`);
        }
      }
    } else {
      finalSegments = segments || rawSegments;
    }

    // 4. 保存 segments 到 DB
    if (db && finalSegments.length > 0) {
      VibeLearningResourceTable.updateTranscriptSegments(db, resourceId, finalSegments);
    }

    // 5. 生成带时间戳的 Markdown
    if (finalSegments.length > 0) {
      return formatSegmentsToMarkdown(resourceName, finalSegments, videoUrl);
    }

    // 降级：如果完全没有 segments，使用纯文本
    const lines = [`# ${resourceName}`, ""];
    if (videoUrl) lines.push(`> 视频: ${videoUrl}`, "");
    lines.push("## 转录内容", "", text || "（转录内容为空）");
    return lines.join("\n");
  } finally {
    // 清理临时音频文件
    if (tempAudioPath) {
      try {
        await fs.unlink(tempAudioPath);
      } catch (e) {
        log.warn(`[VibeLearningIndexQueue] Failed to cleanup audio file: ${e}`);
      }
    }
  }
}
