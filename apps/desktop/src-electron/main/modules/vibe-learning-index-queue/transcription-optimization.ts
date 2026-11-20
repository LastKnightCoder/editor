import log from "electron-log";
import PiAiRuntimeModule from "../pi-ai-runtime";
import type { LlmRef } from "../llm-usage-slot";
import type { TaskProgress } from "@/types/vibe-learning";
import {
  TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
  buildTranscriptionOptimizationUserPrompt,
} from "@/constants/prompts/transcription-optimization";

// ============================================================
// 统一媒体处理管线
// ============================================================
/**
 * 解析 LLM 输出的 "MM:SS.mmm:文本" 格式为 segments
 */
export function parseTranscriptLines(output: string): Array<{ text: string; start: number }> {
  return output
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const match = line.match(/^(\d+):([0-5]\d)\.(\d{3}):(.+)$/);
      if (!match) return null;
      const start = parseInt(match[1]) * 60000 + parseInt(match[2]) * 1000 + parseInt(match[3]);
      return { text: match[4].trim(), start };
    })
    .filter((item): item is { text: string; start: number } => item !== null);
}

export function getOptimizationSegmentTextLength(segment: { text: string; start: number }): number {
  const totalSeconds = Math.floor(segment.start / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = segment.start % 1000;
  const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  return timestamp.length + segment.text.length + 2;
}

export function splitWordSegmentsForOptimization(
  wordSegments: Array<{ text: string; start: number; end: number }>,
  chunkMaxChars: number,
  overlapWords: number
): Array<Array<{ text: string; start: number; end: number }>> {
  if (wordSegments.length === 0) {
    return [];
  }

  const chunks: Array<Array<{ text: string; start: number; end: number }>> = [];
  let startIndex = 0;

  while (startIndex < wordSegments.length) {
    let endIndex = startIndex;
    let chunkChars = 0;

    while (endIndex < wordSegments.length) {
      const segment = wordSegments[endIndex];
      const segmentLength = getOptimizationSegmentTextLength(segment);

      if (endIndex > startIndex && chunkChars + segmentLength > chunkMaxChars) {
        break;
      }

      chunkChars += segmentLength;
      endIndex++;

      if (chunkChars >= chunkMaxChars) {
        break;
      }
    }

    if (endIndex === startIndex) {
      endIndex = Math.min(startIndex + 1, wordSegments.length);
    }

    chunks.push(wordSegments.slice(startIndex, endIndex));

    if (endIndex >= wordSegments.length) {
      break;
    }

    const nextStartIndex = Math.max(0, endIndex - overlapWords);
    startIndex = nextStartIndex > startIndex ? nextStartIndex : endIndex;
  }

  return chunks;
}

export function mergeOptimizedChunks(
  parsedChunks: Array<Array<{ text: string; start: number }>>,
  maxEnd: number
): Array<{ text: string; start: number; end: number }> {
  const deduped: Array<{ text: string; start: number }> = [];
  const seen = new Set<string>();

  for (const chunk of parsedChunks) {
    for (const item of chunk) {
      const key = `${item.start}|${item.text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(item);
    }
  }

  deduped.sort((a, b) => a.start - b.start);

  const result: Array<{ text: string; start: number; end: number }> = [];
  for (let i = 0; i < deduped.length; i++) {
    const end = i < deduped.length - 1 ? deduped[i + 1].start - 1 : maxEnd;
    result.push({
      text: deduped[i].text,
      start: deduped[i].start,
      end,
    });
  }

  return result;
}

/**
 * 使用 LLM 优化转录文本（字幕断句，复用 VideoNoteView 的 prompt）
 */
export async function optimizeTranscriptionWithLLM(
  wordSegments: Array<{ text: string; start: number; end: number }>,
  language: string,
  config: {
    llm: LlmRef;
    /** 用量归属：资源所在知识库与资源 id */
    library: string;
    entityId: string;
  },
  onProgress?: (progress: TaskProgress) => void
): Promise<Array<{ text: string; start: number; end: number }>> {
  const chunkMaxChars = 18_000;
  const overlapWords = 80;
  const maxAttempts = 2;

  log.info(
    `[VibeLearningIndexQueue] Optimizing transcription with LLM: ${wordSegments.length} word segments`
  );

  try {
    const chunks = splitWordSegmentsForOptimization(wordSegments, chunkMaxChars, overlapWords);
    log.info(
      `[VibeLearningIndexQueue] Transcription optimization split into ${chunks.length} chunks (chunkMaxChars=${chunkMaxChars}, overlapWords=${overlapWords})`
    );

    if (chunks.length === 0) {
      throw new Error("无可用词级时间戳，无法进行断句优化");
    }

    let completed = 0;
    let failed = 0;
    let inProgress = 0;
    const reportProgress = () => {
      const progress: TaskProgress = {
        total: chunks.length,
        completed,
        failed,
        inProgress,
      };
      onProgress?.(progress);
      const percent =
        chunks.length > 0 ? Math.floor(((completed + failed) / chunks.length) * 100) : 100;
      log.info(
        `[VibeLearningIndexQueue] Transcription optimization progress snapshot: ${percent}% (completed=${completed}, failed=${failed}, inProgress=${inProgress}, total=${chunks.length})`
      );
    };

    reportProgress();

    const parsedChunks: Array<Array<{ text: string; start: number }>> = [];

    // 顺序处理，避免同一资源并发大请求导致超时叠加
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStartTime = Date.now();
      inProgress = 1;
      reportProgress();

      const userPrompt = buildTranscriptionOptimizationUserPrompt(chunk, language);

      // 模型特殊处理
      const modelId = config.llm.modelId;
      const isKimiModel = modelId.startsWith("kimi");
      const noTemperature = ["o1", "o3", "o4", "gpt-5"].some(p => modelId.startsWith(p));

      let parsedChunk: Array<{ text: string; start: number }> | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          log.info(
            `[VibeLearningIndexQueue] Optimizing chunk ${i + 1}/${chunks.length}, attempt=${attempt}, segments=${chunk.length}`
          );
          // 断句是机械任务：kimi 官方推荐 0.6，o 系 / gpt-5 不接受 temperature
          const result = await PiAiRuntimeModule.complete({
            providerId: config.llm.providerId,
            modelId: config.llm.modelId,
            system: TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
            ...(config.llm.thinkingLevel ? { thinking: config.llm.thinkingLevel } : {}),
            ...(isKimiModel ? { temperature: 0.6 } : noTemperature ? {} : { temperature: 0.3 }),
            source: {
              feature: "transcriptionOptimization",
              library: config.library,
              entityId: config.entityId,
            },
          });
          if (!result.ok) throw new Error(result.error ?? "模型请求失败");
          const parsed = parseTranscriptLines(result.text);

          if (parsed.length === 0) {
            throw new Error("LLM 断句输出为空或无法解析");
          }

          parsedChunk = parsed;
          break;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.warn(
            `[VibeLearningIndexQueue] Chunk ${i + 1}/${chunks.length} attempt ${attempt} failed: ${errorMessage}`
          );
          if (attempt >= maxAttempts) {
            failed++;
            inProgress = 0;
            reportProgress();
            throw new Error(
              `断句优化失败（chunk ${i + 1}/${chunks.length}，重试 1 次后仍失败）：${errorMessage}`
            );
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!parsedChunk) {
        throw new Error(`断句优化失败（chunk ${i + 1}/${chunks.length}）`);
      }

      completed++;
      inProgress = 0;
      parsedChunks.push(parsedChunk);
      const chunkElapsedMs = Date.now() - chunkStartTime;
      log.info(
        `[VibeLearningIndexQueue] Chunk ${i + 1}/${chunks.length} complete in ${chunkElapsedMs}ms, sentences=${parsedChunk.length}`
      );
      reportProgress();
    }

    // 计算 end 时间：下一句的 start - 1ms，最后一句用词级 segments 的最大 end
    const maxEnd = wordSegments.length > 0 ? wordSegments[wordSegments.length - 1].end : 5000;

    const result = mergeOptimizedChunks(parsedChunks, maxEnd);

    if (result.length === 0) {
      throw new Error("LLM 转录优化结果为空");
    }

    log.info(
      `[VibeLearningIndexQueue] Transcription optimization complete: ${result.length} sentences`
    );

    return result;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error optimizing transcription: ${error}`);
    throw error;
  }
}
