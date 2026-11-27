import { ebookTranslator } from "@/components/VideoNotePanel/i18n-ebook";
import { useState, useRef, useCallback, useEffect } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { Descendant } from "slate";
import { piStreamText, type PiChatHandle } from "@/services/piLLM";
import { aiNotifyText } from "@/services/notifications/ai.i18n";
import { notifyAiTask } from "@/services/notifications/aiNotify";
import {
  VIDEO_EBOOK_REWRITE_SYSTEM_PROMPT,
  buildVideoEbookRewriteUserPrompt,
} from "@/constants/prompts/video-ebook-rewrite";
import { importFromMarkdown } from "@/utils/markdown";
import { Role } from "@/constants";
import type { LLMProviderSetting, LLMModelSetting, PiThinkingLevel } from "@/types/pi-llm";
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
  provider: LLMProviderSetting | null,
  model: LLMModelSetting | null,
  thinkingLevel?: PiThinkingLevel
): UseVideoEbookRewriteResult => {
  const [isRewriting, setIsRewriting] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [streamingMarkdown, setStreamingMarkdown] = useState("");
  const [ebookContent, setEbookContent] = useState<Descendant[] | null>(null);
  const [finalMarkdown, setFinalMarkdown] = useState<string | null>(null);

  const chatHandleRef = useRef<PiChatHandle | null>(null);
  const requestVersion = useRef(0);

  const {
    run: throttledParse,
    flush: flushParse,
    cancel: cancelParse,
  } = useThrottleFn(
    (markdown: string) => {
      try {
        const parsed = importFromMarkdown(markdown);
        setEbookContent(parsed);
      } catch (parseError) {
        console.warn("[VideoEbookRewrite] 流式 Markdown 解析失败，等待后续内容纠正:", parseError);
      }
    },
    { wait: 120 }
  );

  const startRewrite = useMemoizedFn((input: VideoEbookRewriteInput) => {
    if (!provider || !model) {
      setError(new Error(ebookTranslator.t("rewrite.noModel")));
      return;
    }

    if (!input.transcript.trim()) {
      setError(new Error(ebookTranslator.t("rewrite.noTranscript")));
      return;
    }

    const request = ++requestVersion.current;
    chatHandleRef.current?.cancel();
    cancelParse();
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

    const handle = piStreamText(
      {
        provider,
        model,
        ...(thinkingLevel ? { thinking: thinkingLevel } : {}),
        messages,
        source: { feature: "videoEbookRewrite" },
      },
      ({ text }) => {
        if (request !== requestVersion.current) return;
        setIsPending(false);
        setStreamingMarkdown(text);
        throttledParse(text);
      }
    );
    chatHandleRef.current = handle;
    void handle.result.then(result => {
      if (request !== requestVersion.current) return;
      requestVersion.current++;
      chatHandleRef.current = null;
      if (result.ok && !result.aborted) {
        setIsRewriting(false);
        setIsPending(false);
        setFinalMarkdown(result.text);
        setStreamingMarkdown(result.text);
        flushParse();

        if (!result.text.trim()) {
          const emptyErr = new Error(ebookTranslator.t("rewrite.emptyResult"));
          setError(emptyErr);
          notifyAiTask({
            id: "video-ebook-rewrite",
            mode: "unfocused-only",
            title: aiNotifyText("ebook.failedTitle"),
            body: emptyErr.message,
            source: aiNotifyText("source.ebook"),
            icon: "sparkles",
            tone: "danger",
            sticky: true,
          });
          return;
        }

        try {
          const parsed = importFromMarkdown(result.text);
          setEbookContent(parsed);
          notifyAiTask({
            id: "video-ebook-rewrite",
            mode: "unfocused-only",
            title: aiNotifyText("ebook.doneTitle"),
            body: aiNotifyText("ebook.doneBody"),
            source: aiNotifyText("source.ebook"),
            icon: "sparkles",
            tone: "ok",
          });
        } catch (parseError) {
          const parseErr = new Error(ebookTranslator.t("rewrite.parseFailed"));
          setError(parseErr);
          notifyAiTask({
            id: "video-ebook-rewrite",
            mode: "unfocused-only",
            title: aiNotifyText("ebook.failedTitle"),
            body: parseErr.message,
            source: aiNotifyText("source.ebook"),
            icon: "sparkles",
            tone: "danger",
            sticky: true,
          });
          console.error("[VideoEbookRewrite] Final markdown parse failed:", parseError);
        }
        return;
      }
      if (!result.aborted) {
        setIsRewriting(false);
        setIsPending(false);
        const streamError = new Error(result.error ?? ebookTranslator.t("rewrite.requestFailed"));
        setError(streamError);
        notifyAiTask({
          id: "video-ebook-rewrite",
          mode: "unfocused-only",
          title: aiNotifyText("ebook.failedTitle"),
          body: streamError.message,
          source: aiNotifyText("source.ebook"),
          icon: "sparkles",
          tone: "danger",
          sticky: true,
        });
        console.error("[VideoEbookRewrite] Error:", streamError);
      }
    });
  });

  const stopRewrite = useCallback(() => {
    flushParse();
    requestVersion.current++;
    cancelParse();
    chatHandleRef.current?.cancel();
    chatHandleRef.current = null;
    setIsRewriting(false);
    setIsPending(false);
  }, [flushParse, cancelParse]);

  useEffect(() => () => stopRewrite(), [stopRewrite]);

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
