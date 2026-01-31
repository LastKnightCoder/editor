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

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
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

  const startOptimization = useMemoizedFn(
    (wordSegments: TranscriptSegment[], language: string) => {
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

      // 单次流式 LLM 调用
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
            originalSegmentsRef.current[originalSegmentsRef.current.length - 1]
              ?.end || 0;
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
            originalSegmentsRef.current[originalSegmentsRef.current.length - 1]
              ?.end || 0;
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
