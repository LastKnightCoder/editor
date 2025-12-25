import { useState, useCallback, useRef } from "react";
import { useThrottleFn, useMemoizedFn } from "ahooks";
import { chatLLMStream } from "./useChatLLM";
import {
  TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
  buildTranscriptionOptimizationUserPrompt,
} from "@/constants/prompts/transcription-optimization";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { RequestMessage } from "@/types";
import useSettingStore from "@/stores/useSettingStore";

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

// LLM 优化分段配置
interface LLMOptimizationConfig {
  wordsPerSegment: number; // 每段处理的词数
  overlapWords: number; // 重叠词数
  enableForMinWords: number; // 启用分段的最小词数
}

const DEFAULT_LLM_CONFIG: LLMOptimizationConfig = {
  wordsPerSegment: 3000,
  overlapWords: 200,
  enableForMinWords: 3500,
};

// LLM 优化分段信息
interface LLMOptimizationSegment {
  segmentIndex: number;
  wordSegments: TranscriptSegment[];
  overlapStartTime: number; // 重叠区域开始时间
  overlapEndTime: number; // 重叠区域结束时间
  originalLastEnd: number; // 该段原始 wordSegments 的最后 end 时间
  status: "pending" | "processing" | "completed" | "failed";
  result?: Array<{ text: string; start: number }>;
  error?: string;
}

// 流式阶段的 segment，end 可能为 null（等待下一句确定）
interface StreamingTranscriptSegment {
  text: string;
  start: number;
  end: number | null;
  status: "pending" | "confirmed";
}

interface UseTranscriptionOptimizationResult {
  // 状态
  isOptimizing: boolean;
  isPending: boolean; // 等待首个数据块
  error: Error | null;

  // 流式数据
  streamingSegments: StreamingTranscriptSegment[];
  rawOutput: string;

  // 方法
  startOptimization: (
    wordSegments: TranscriptSegment[],
    language: string,
  ) => void;
  stopOptimization: () => void;

  // 最终结果（完成后可用）
  finalSegments: TranscriptSegment[] | null;
}

/**
 * 增量解析器 - 处理流式数据的逐行解析
 */
class IncrementalTranscriptParser {
  private pendingBuffer = "";
  private parsedSegments: Array<{ text: string; start: number }> = [];

  /**
   * 处理新数据块
   * @param newChunk 新的文本块
   * @returns 新解析的 segments
   */
  processChunk(newChunk: string): Array<{ text: string; start: number }> {
    const combined = this.pendingBuffer + newChunk;
    const lines = combined.split("\n");

    // 最后一段可能不完整，保留到 buffer
    this.pendingBuffer = lines.pop() || "";

    const newSegments: Array<{ text: string; start: number }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = this.parseLine(trimmed);
      if (parsed) {
        this.parsedSegments.push(parsed);
        newSegments.push(parsed);
      }
    }

    return newSegments;
  }

  /**
   * 解析单行 "MM:SS.mmm:文本"
   */
  private parseLine(line: string): { text: string; start: number } | null {
    // 查找第一个冒号（时间戳中的冒号）
    const firstColonIndex = line.indexOf(":");
    if (firstColonIndex === -1) return null;

    // 查找第二个冒号（时间戳和文本之间）
    const secondColonIndex = line.indexOf(":", firstColonIndex + 1);
    if (secondColonIndex === -1) return null;

    const timeStr = line.substring(0, secondColonIndex);
    const text = line.substring(secondColonIndex + 1).trim();

    if (!text) return null;

    const start = this.parseTime(timeStr);
    if (start === null) return null;

    return { text, start };
  }

  /**
   * 解析时间字符串 "MM:SS.mmm" 为毫秒
   */
  private parseTime(timeStr: string): number | null {
    const match = timeStr.match(/^(\d{2}):(\d{2})\.(\d{3})$/);
    if (!match) return null;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3], 10);

    return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
  }

  /**
   * 流结束时处理剩余缓冲
   */
  finalize(): Array<{ text: string; start: number }> {
    if (this.pendingBuffer.trim()) {
      const parsed = this.parseLine(this.pendingBuffer.trim());
      if (parsed) {
        this.parsedSegments.push(parsed);
        return [parsed];
      }
    }
    return [];
  }

  /**
   * 获取所有已解析的 segments
   */
  getAllSegments(): Array<{ text: string; start: number }> {
    return [...this.parsedSegments];
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.pendingBuffer = "";
    this.parsedSegments = [];
  }
}

/**
 * 计算流式 segments 的结束时间
 * @param segments 已解析的 segments（只有 start）
 * @param _originalLastEnd 原始数据最后一个词的结束时间（保留参数以备后用）
 */
function calculateStreamingEndTimes(
  segments: Array<{ text: string; start: number }>,
  _originalLastEnd: number,
): StreamingTranscriptSegment[] {
  const result: StreamingTranscriptSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];
    const isLast = i === segments.length - 1;

    let end: number | null;
    let status: "pending" | "confirmed";

    if (!isLast) {
      // 非最后一句：使用下一句的 start - 1ms
      end = segments[i + 1].start - 1;
      status = "confirmed";
    } else {
      // 最后一句：流式阶段 end 为 null
      end = null;
      status = "pending";
    }

    result.push({
      text: current.text,
      start: current.start,
      end,
      status,
    });
  }

  return result;
}

/**
 * 最终化 segments，计算所有结束时间
 */
function finalizeSegments(
  segments: Array<{ text: string; start: number }>,
  originalSegments: TranscriptSegment[],
): TranscriptSegment[] {
  if (segments.length === 0) return [];

  const lastOriginalEnd = originalSegments[originalSegments.length - 1].end;
  const result: TranscriptSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];
    const isLast = i === segments.length - 1;

    let end: number;
    if (isLast) {
      end = lastOriginalEnd;
    } else {
      end = segments[i + 1].start - 1;
    }

    result.push({
      text: current.text,
      start: current.start,
      end,
    });
  }

  return result;
}

// ==================== LLM 分段处理相关函数 ====================

/**
 * 将 wordSegments 拆分为多个分段用于 LLM 处理
 */
function splitWordSegmentsForLLM(
  wordSegments: TranscriptSegment[],
  config: LLMOptimizationConfig = DEFAULT_LLM_CONFIG,
): LLMOptimizationSegment[] {
  // 不需要分段
  if (wordSegments.length <= config.enableForMinWords) {
    return [
      {
        segmentIndex: 0,
        wordSegments,
        overlapStartTime: 0,
        overlapEndTime: 0,
        originalLastEnd: wordSegments[wordSegments.length - 1]?.end || 0,
        status: "pending",
      },
    ];
  }

  const segments: LLMOptimizationSegment[] = [];
  let currentIndex = 0;
  let segmentIndex = 0;

  while (currentIndex < wordSegments.length) {
    const endIndex = Math.min(
      currentIndex + config.wordsPerSegment,
      wordSegments.length,
    );
    const segmentWords = wordSegments.slice(currentIndex, endIndex);

    // 计算重叠区域时间范围
    let overlapStartTime = 0;
    let overlapEndTime = 0;

    if (segmentIndex > 0) {
      // 非第一段：重叠区域是该段的前 overlapWords 个词
      const overlapStartIdx = 0;
      const overlapEndIdx = Math.min(config.overlapWords, segmentWords.length);
      overlapStartTime = segmentWords[overlapStartIdx]?.start || 0;
      overlapEndTime = segmentWords[overlapEndIdx - 1]?.end || 0;
    }

    segments.push({
      segmentIndex,
      wordSegments: segmentWords,
      overlapStartTime,
      overlapEndTime,
      originalLastEnd: segmentWords[segmentWords.length - 1]?.end || 0,
      status: "pending",
    });

    // 下一段的起始位置（减去重叠部分）
    currentIndex = endIndex - config.overlapWords;
    if (currentIndex >= wordSegments.length) break;
    if (currentIndex < 0) currentIndex = 0;
    segmentIndex++;
  }

  return segments;
}

/**
 * 计算 Jaccard 相似度（字符级）
 */
function calculateJaccardSimilarity(text1: string, text2: string): number {
  // 移除标点和空格后计算
  const clean1 = text1.replace(/[，。！？、；：""''（）\s]/g, "");
  const clean2 = text2.replace(/[，。！？、；：""''（）\s]/g, "");

  if (clean1.length === 0 || clean2.length === 0) return 0;

  const chars1 = new Set(clean1.split(""));
  const chars2 = new Set(clean2.split(""));

  const intersection = [...chars1].filter((c) => chars2.has(c)).length;
  const union = new Set([...chars1, ...chars2]).size;

  return union === 0 ? 0 : intersection / union;
}

interface SplitResult {
  prevCutIndex: number; // 段落 A 取到这个索引（不包含）
  currentStartIndex: number; // 段落 B 从这个索引开始
}

/**
 * 在重叠区域找到最佳分割点（时间 + 内容综合匹配）
 */
function findBestSplitPoint(
  prevResult: Array<{ text: string; start: number }>,
  currentResult: Array<{ text: string; start: number }>,
  overlapStartTime: number,
  overlapEndTime: number,
): SplitResult {
  // 1. 筛选出重叠区域内的句子
  const prevOverlapSentences = prevResult
    .map((s, idx) => ({ ...s, originalIndex: idx }))
    .filter((s) => s.start >= overlapStartTime - 1000); // 允许 1 秒误差

  const currentOverlapSentences = currentResult
    .map((s, idx) => ({ ...s, originalIndex: idx }))
    .filter((s) => s.start <= overlapEndTime + 1000);

  // 2. 如果没有重叠句子，使用时间分割
  if (
    prevOverlapSentences.length === 0 ||
    currentOverlapSentences.length === 0
  ) {
    return fallbackToTimeSplit(prevResult, currentResult, overlapEndTime);
  }

  // 3. 计算每对句子的匹配得分（时间 + 内容）
  let bestMatch = { score: -Infinity, prevIndex: -1, currentIndex: -1 };

  for (const prevSentence of prevOverlapSentences) {
    for (const currentSentence of currentOverlapSentences) {
      // 时间得分：时间差在 3 秒内得满分，超过 10 秒得 0 分
      const timeDiff = Math.abs(prevSentence.start - currentSentence.start);
      const timeScore = Math.max(0, 1 - timeDiff / 10000);

      // 内容得分：使用 Jaccard 相似度（字符级）
      const contentScore = calculateJaccardSimilarity(
        prevSentence.text,
        currentSentence.text,
      );

      // 综合得分：时间权重 40%，内容权重 60%
      const score = timeScore * 0.4 + contentScore * 0.6;

      if (score > bestMatch.score) {
        bestMatch = {
          score,
          prevIndex: prevSentence.originalIndex,
          currentIndex: currentSentence.originalIndex,
        };
      }
    }
  }

  // 4. 根据匹配结果确定分割点
  if (bestMatch.score > 0.3) {
    // 找到了较好的匹配，在匹配点分割
    // 段落 A 取到匹配句子（包含），段落 B 从匹配句子的下一个开始
    return {
      prevCutIndex: bestMatch.prevIndex + 1,
      currentStartIndex: bestMatch.currentIndex + 1,
    };
  }

  // 5. 没有好的匹配，使用时间分割
  return fallbackToTimeSplit(prevResult, currentResult, overlapEndTime);
}

/**
 * 时间分割备选方案
 */
function fallbackToTimeSplit(
  prevResult: Array<{ text: string; start: number }>,
  currentResult: Array<{ text: string; start: number }>,
  splitTime: number,
): SplitResult {
  // 段落 A：取所有 start < splitTime 的句子
  let prevCutIndex = prevResult.length;
  for (let i = prevResult.length - 1; i >= 0; i--) {
    if (prevResult[i].start < splitTime) {
      prevCutIndex = i + 1;
      break;
    }
  }

  // 段落 B：从第一个 start >= splitTime 的句子开始
  let currentStartIndex = 0;
  for (let i = 0; i < currentResult.length; i++) {
    if (currentResult[i].start >= splitTime) {
      currentStartIndex = i;
      break;
    }
  }

  return { prevCutIndex, currentStartIndex };
}

/**
 * 合并多个 LLM 优化结果
 */
function mergeLLMOptimizationResults(
  segments: LLMOptimizationSegment[],
  originalWordSegments: TranscriptSegment[],
): TranscriptSegment[] {
  if (segments.length === 0) return [];

  // 单段不需要合并
  if (segments.length === 1) {
    return finalizeSegments(segments[0].result || [], segments[0].wordSegments);
  }

  const mergedSentences: Array<{ text: string; start: number }> = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment.result || segment.result.length === 0) continue;

    if (i === 0) {
      // 第一段：取所有句子
      mergedSentences.push(...segment.result);
    } else {
      // 非第一段：找到分割点后合并
      const prevSegment = segments[i - 1];
      if (!prevSegment.result || prevSegment.result.length === 0) {
        // 前一段没有结果，直接取当前段
        mergedSentences.push(...segment.result);
        continue;
      }

      const { currentStartIndex } = findBestSplitPoint(
        prevSegment.result,
        segment.result,
        segment.overlapStartTime,
        segment.overlapEndTime,
      );

      // 从 currentStartIndex 开始添加句子
      for (let j = currentStartIndex; j < segment.result.length; j++) {
        mergedSentences.push(segment.result[j]);
      }
    }
  }

  // 最终化 segments
  return finalizeSegments(mergedSentences, originalWordSegments);
}

// ==================== Hook 主体 ====================

export const useTranscriptionOptimization = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
): UseTranscriptionOptimizationResult => {
  // 状态
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [streamingSegments, setStreamingSegments] = useState<
    StreamingTranscriptSegment[]
  >([]);
  const [rawOutput, setRawOutput] = useState("");
  const [finalSegments, setFinalSegments] = useState<
    TranscriptSegment[] | null
  >(null);

  // Refs
  const controllerRef = useRef<AbortController | null>(null);
  const parserRef = useRef<IncrementalTranscriptParser | null>(null);
  const originalSegmentsRef = useRef<TranscriptSegment[]>([]);

  // 节流更新 UI（100ms）
  const { run: throttledUpdateSegments, flush: flushThrottledUpdate } =
    useThrottleFn(
      (segments: StreamingTranscriptSegment[]) => {
        setStreamingSegments(segments);
      },
      { wait: 100 },
    );

  /**
   * 处理单个分段的 LLM 优化（返回 Promise）
   */
  const processSegmentWithLLM = useMemoizedFn(
    (
      segment: LLMOptimizationSegment,
      language: string,
    ): Promise<Array<{ text: string; start: number }>> => {
      return new Promise((resolve, reject) => {
        const parser = new IncrementalTranscriptParser();

        const userPrompt = buildTranscriptionOptimizationUserPrompt(
          segment.wordSegments,
          language,
        );
        const messages: RequestMessage[] = [
          {
            role: Role.System,
            content: [
              { type: "text", text: TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT },
            ],
          },
          {
            role: Role.User,
            content: [{ type: "text", text: userPrompt }],
          },
        ];

        chatLLMStream(providerConfig!, modelConfig!, messages, {
          onUpdate: (responseText: string) => {
            setIsPending(false);
            // 更新原始输出用于调试
            setRawOutput(responseText);

            // 解析流式输出用于实时显示
            parser.reset();
            parser.processChunk(responseText);
            const allParsed = parser.getAllSegments();
            const withEndTimes = calculateStreamingEndTimes(
              allParsed,
              segment.originalLastEnd,
            );
            throttledUpdateSegments(withEndTimes);
          },

          onFinish: (fullContent: string) => {
            flushThrottledUpdate();
            parser.reset();
            parser.processChunk(fullContent);
            parser.finalize();
            const result = parser.getAllSegments();
            resolve(result);
          },

          onError: (err: Error) => {
            // 如果有部分结果，返回部分结果
            const partialResult = parser.getAllSegments();
            if (partialResult.length > 0) {
              console.warn(
                `[TranscriptionOptimization] Segment ${segment.segmentIndex} partial result: ${partialResult.length} sentences`,
              );
              resolve(partialResult);
            } else {
              reject(err);
            }
          },

          onController: (controller: AbortController) => {
            controllerRef.current = controller;
          },
        });
      });
    },
  );

  const startOptimization = useMemoizedFn(
    async (wordSegments: TranscriptSegment[], language: string) => {
      console.log(
        `[TranscriptionOptimization] Starting optimization with ${wordSegments.length} word segments`,
      );

      if (!providerConfig || !modelConfig) {
        const errorMsg = "未配置转录优化模型";
        console.error(`[TranscriptionOptimization] ${errorMsg}`);
        setError(new Error(errorMsg));
        return;
      }

      if (wordSegments.length === 0) {
        console.warn(
          "[TranscriptionOptimization] No word segments to optimize",
        );
        setFinalSegments([]);
        return;
      }

      // 重置状态
      setIsOptimizing(true);
      setIsPending(true);
      setError(null);
      setStreamingSegments([]);
      setRawOutput("");
      setFinalSegments(null);

      // 保存原始 segments
      originalSegmentsRef.current = wordSegments;

      // 检查是否启用 LLM 分段
      const enableLLMSegmentation =
        useSettingStore.getState().setting.misc.transcription
          ?.enableLLMSegmentation ?? true;

      // 拆分为多个分段
      const llmSegments = enableLLMSegmentation
        ? splitWordSegmentsForLLM(wordSegments)
        : splitWordSegmentsForLLM(wordSegments, {
            ...DEFAULT_LLM_CONFIG,
            enableForMinWords: Infinity, // 禁用分段
          });

      console.log(
        `[TranscriptionOptimization] Split into ${llmSegments.length} segments`,
      );

      // 单段处理：使用原有的流式逻辑
      if (llmSegments.length === 1) {
        parserRef.current = new IncrementalTranscriptParser();

        const userPrompt = buildTranscriptionOptimizationUserPrompt(
          wordSegments,
          language,
        );
        const messages: RequestMessage[] = [
          {
            role: Role.System,
            content: [
              { type: "text", text: TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT },
            ],
          },
          {
            role: Role.User,
            content: [{ type: "text", text: userPrompt }],
          },
        ];

        chatLLMStream(providerConfig, modelConfig, messages, {
          onUpdate: (responseText: string) => {
            setIsPending(false);
            setRawOutput(responseText);

            if (!parserRef.current) return;

            parserRef.current.reset();
            parserRef.current.processChunk(responseText);

            const allParsed = parserRef.current.getAllSegments();
            const lastOriginalEnd =
              originalSegmentsRef.current[
                originalSegmentsRef.current.length - 1
              ]?.end || 0;
            const withEndTimes = calculateStreamingEndTimes(
              allParsed,
              lastOriginalEnd,
            );

            throttledUpdateSegments(withEndTimes);
          },

          onFinish: (fullContent: string) => {
            setIsOptimizing(false);
            setIsPending(false);
            flushThrottledUpdate();

            if (!parserRef.current) return;

            parserRef.current.reset();
            parserRef.current.processChunk(fullContent);
            parserRef.current.finalize();

            const allParsed = parserRef.current.getAllSegments();

            if (allParsed.length === 0) {
              console.warn(
                "[TranscriptionOptimization] No valid segments parsed",
              );
              setFinalSegments(originalSegmentsRef.current);
              return;
            }

            const final = finalizeSegments(
              allParsed,
              originalSegmentsRef.current,
            );

            const lastOriginalEnd =
              originalSegmentsRef.current[
                originalSegmentsRef.current.length - 1
              ]?.end || 0;
            const withEndTimes = calculateStreamingEndTimes(
              allParsed,
              lastOriginalEnd,
            );
            setStreamingSegments(withEndTimes);

            setFinalSegments(final);

            console.log(
              `[TranscriptionOptimization] Parsed ${final.length} sentences`,
            );
          },

          onError: (err: Error) => {
            setIsOptimizing(false);
            setIsPending(false);
            setError(err);
            console.error("[TranscriptionOptimization] Stream error:", err);

            if (parserRef.current) {
              const allParsed = parserRef.current.getAllSegments();
              if (allParsed.length > 0) {
                const partial = finalizeSegments(
                  allParsed,
                  originalSegmentsRef.current,
                );
                setFinalSegments(partial);
                console.log(
                  `[TranscriptionOptimization] Using ${partial.length} partial segments after error`,
                );
                return;
              }
            }

            setFinalSegments(originalSegmentsRef.current);
          },

          onController: (controller: AbortController) => {
            controllerRef.current = controller;
          },
        });

        return;
      }

      // 多段处理：顺序处理每个分段
      try {
        for (let i = 0; i < llmSegments.length; i++) {
          const segment = llmSegments[i];
          segment.status = "processing";

          console.log(
            `[TranscriptionOptimization] Processing segment ${i + 1}/${llmSegments.length}`,
          );

          try {
            const result = await processSegmentWithLLM(segment, language);
            segment.result = result;
            segment.status = "completed";

            console.log(
              `[TranscriptionOptimization] Segment ${i + 1} completed with ${result.length} sentences`,
            );
          } catch (err) {
            segment.status = "failed";
            segment.error = err instanceof Error ? err.message : String(err);
            console.error(
              `[TranscriptionOptimization] Segment ${i + 1} failed:`,
              err,
            );
            // 继续处理下一个分段
          }
        }

        // 合并结果
        console.log("[TranscriptionOptimization] Merging results...");
        const mergedResult = mergeLLMOptimizationResults(
          llmSegments,
          wordSegments,
        );

        setFinalSegments(mergedResult);
        setIsOptimizing(false);
        setIsPending(false);

        console.log(
          `[TranscriptionOptimization] Merged ${mergedResult.length} sentences from ${llmSegments.length} segments`,
        );
      } catch (err) {
        setIsOptimizing(false);
        setIsPending(false);
        setError(err instanceof Error ? err : new Error(String(err)));
        console.error("[TranscriptionOptimization] Multi-segment error:", err);

        // 回退到原始 segments
        setFinalSegments(originalSegmentsRef.current);
      }
    },
  );

  const stopOptimization = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsOptimizing(false);
    setIsPending(false);
  }, []);

  return {
    isOptimizing,
    isPending,
    error,
    streamingSegments,
    rawOutput,
    finalSegments,
    startOptimization,
    stopOptimization,
  };
};

export default useTranscriptionOptimization;
