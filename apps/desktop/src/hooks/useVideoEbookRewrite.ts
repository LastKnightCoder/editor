import { useState, useRef, useCallback } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { Descendant } from "slate";
import { chatLLMStream } from "./useChatLLM";
import {
  VIDEO_EBOOK_REWRITE_SYSTEM_PROMPT,
  buildVideoEbookRewriteUserPrompt,
} from "@/constants/prompts/video-ebook-rewrite";
import { importFromMarkdown } from "@/utils/markdown";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { RequestMessage } from "@/types";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";

export interface VideoEbookRewriteInput {
  transcript: string;
  videoTitle?: string;
  videoDescription?: string;
  style: VideoEbookRewriteStyle;
}

interface UseVideoEbookRewriteResult {
  isRewriting: boolean;
  isPending: boolean;
  error: Error | null;
  streamingMarkdown: string;
  ebookContent: Descendant[] | null;
  finalMarkdown: string | null;
  startRewrite: (input: VideoEbookRewriteInput) => void;
  stopRewrite: () => void;
  reset: () => void;
}

export const useVideoEbookRewrite = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
): UseVideoEbookRewriteResult => {
  const [isRewriting, setIsRewriting] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [streamingMarkdown, setStreamingMarkdown] = useState("");
  const [ebookContent, setEbookContent] = useState<Descendant[] | null>(null);
  const [finalMarkdown, setFinalMarkdown] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  const { run: throttledParse, flush: flushParse } = useThrottleFn(
    (markdown: string) => {
      try {
        const parsed = importFromMarkdown(markdown);
        setEbookContent(parsed);
      } catch (parseError) {
        console.warn(
          "[VideoEbookRewrite] 流式 Markdown 解析失败，等待后续内容纠正:",
          parseError,
        );
      }
    },
    { wait: 120 },
  );

  const startRewrite = useMemoizedFn((input: VideoEbookRewriteInput) => {
    if (!providerConfig || !modelConfig) {
      setError(new Error("未配置视频电子书重写模型"));
      return;
    }

    if (!input.transcript.trim()) {
      setError(new Error("没有可用的转录文稿"));
      return;
    }

    setIsRewriting(true);
    setIsPending(true);
    setError(null);
    setStreamingMarkdown("");
    setEbookContent(null);
    setFinalMarkdown(null);

    const messages: RequestMessage[] = [
      {
        role: Role.System,
        content: [{ type: "text", text: VIDEO_EBOOK_REWRITE_SYSTEM_PROMPT }],
      },
      {
        role: Role.User,
        content: [
          {
            type: "text",
            text: buildVideoEbookRewriteUserPrompt(input),
          },
        ],
      },
    ];

    chatLLMStream(providerConfig, modelConfig, messages, {
      onUpdate: (responseText: string) => {
        setIsPending(false);
        setStreamingMarkdown(responseText);
        throttledParse(responseText);
      },
      onFinish: (fullContent: string) => {
        setIsRewriting(false);
        setIsPending(false);
        setFinalMarkdown(fullContent);
        setStreamingMarkdown(fullContent);
        flushParse();

        if (!fullContent.trim()) {
          setError(new Error("重写结果为空"));
          return;
        }

        try {
          const parsed = importFromMarkdown(fullContent);
          setEbookContent(parsed);
        } catch (parseError) {
          setError(new Error("重写完成，但 Markdown 解析失败，请重试"));
          console.error(
            "[VideoEbookRewrite] Final markdown parse failed:",
            parseError,
          );
        }
      },
      onError: (streamError: Error) => {
        setIsRewriting(false);
        setIsPending(false);
        setError(streamError);
        console.error("[VideoEbookRewrite] Error:", streamError);
      },
      onController: (controller: AbortController) => {
        controllerRef.current = controller;
      },
    });
  });

  const stopRewrite = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsRewriting(false);
    setIsPending(false);
  }, []);

  const reset = useMemoizedFn(() => {
    stopRewrite();
    setError(null);
    setStreamingMarkdown("");
    setEbookContent(null);
    setFinalMarkdown(null);
  });

  return {
    isRewriting,
    isPending,
    error,
    streamingMarkdown,
    ebookContent,
    finalMarkdown,
    startRewrite,
    stopRewrite,
    reset,
  };
};

export default useVideoEbookRewrite;
