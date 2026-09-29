import { useState, useCallback, useRef } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { Descendant } from "slate";
import { piStreamText, type PiChatHandle } from "@/services/piLLM";
import {
  VIDEO_SUMMARY_SYSTEM_PROMPT,
  buildVideoSummaryUserPrompt,
} from "@/constants/prompts/video-summary";
import { importFromMarkdown } from "@/utils/markdown";
import { Role } from "@/constants";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { RequestMessage } from "@/types";

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

interface UseVideoSummaryResult {
  // 状态
  isSummarizing: boolean;
  error: Error | null;

  // 流式数据
  streamingContent: string;
  summaryContent: Descendant[] | null;

  // 最终结果
  finalSummary: string | null;

  // 方法
  startSummary: (segments: TranscriptSegment[]) => void;
  stopSummary: () => void;
}

export const useVideoSummary = (
  provider: LLMProviderSetting | null,
  model: LLMModelSetting | null
): UseVideoSummaryResult => {
  // 状态
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [summaryContent, setSummaryContent] = useState<Descendant[] | null>(null);
  const [finalSummary, setFinalSummary] = useState<string | null>(null);

  // Refs
  const chatHandleRef = useRef<PiChatHandle | null>(null);
  const accumulatedMarkdownRef = useRef<string>("");

  // Throttled parsing to avoid excessive re-renders
  const { run: throttledParse, flush: flushParse } = useThrottleFn(
    (markdown: string) => {
      try {
        const parsed = importFromMarkdown(markdown);
        setSummaryContent(parsed);
      } catch (err) {
        console.error("[VideoSummary] Failed to parse markdown:", err);
      }
    },
    { wait: 100 }
  );

  const startSummary = useMemoizedFn((segments: TranscriptSegment[]) => {
    if (!provider || !model) {
      setError(new Error("未配置视频总结模型"));
      return;
    }

    if (segments.length === 0) {
      setError(new Error("没有可用的转录内容"));
      return;
    }

    // 重置状态
    setIsSummarizing(true);
    setError(null);
    setStreamingContent("");
    setSummaryContent(null);
    setFinalSummary(null);
    accumulatedMarkdownRef.current = "";

    // 构建消息
    const userPrompt = buildVideoSummaryUserPrompt(segments);
    const messages: RequestMessage[] = [
      {
        role: Role.System,
        content: [{ type: "text", text: VIDEO_SUMMARY_SYSTEM_PROMPT }],
      },
      {
        role: Role.User,
        content: [{ type: "text", text: userPrompt }],
      },
    ];

    const handle = piStreamText(
      { provider, model, messages, source: { feature: "videoSummary" } },
      ({ text }) => {
        accumulatedMarkdownRef.current = text;
        setStreamingContent(text);
        throttledParse(text);
      }
    );
    chatHandleRef.current = handle;
    void handle.result.then(result => {
      if (result.ok && !result.aborted) {
        setIsSummarizing(false);
        setFinalSummary(result.text);
        setStreamingContent(result.text);
        // Force final parse
        flushParse();
        if (result.text) {
          try {
            const parsed = importFromMarkdown(result.text);
            setSummaryContent(parsed);
          } catch (err) {
            console.error("[VideoSummary] Failed to parse final markdown:", err);
          }
        }
        console.log("[VideoSummary] Summary completed");
        return;
      }
      if (!result.aborted) {
        setIsSummarizing(false);
        setError(new Error(result.error ?? "模型请求失败"));
        console.error("[VideoSummary] Error:", result.error);
      }
    });
  });

  const stopSummary = useCallback(() => {
    chatHandleRef.current?.cancel();
    chatHandleRef.current = null;
    setIsSummarizing(false);
  }, []);

  return {
    isSummarizing,
    error,
    streamingContent,
    summaryContent,
    finalSummary,
    startSummary,
    stopSummary,
  };
};

export default useVideoSummary;
