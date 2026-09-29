import { useState, useRef, useCallback } from "react";
import { Descendant } from "slate";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { piStreamText, type PiChatHandle } from "@/services/piLLM";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import { CONTENT_POLISH_PROMPT } from "@/constants/prompts";
import { Role } from "@/constants";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { RequestMessage } from "@/types";

interface UseContentPolishResult {
  polishedContent: Descendant[] | null;
  setPolishedContent: (content: Descendant[]) => void;
  isPolishing: boolean;
  polishPending: boolean;
  error: Error | null;
  startPolish: (content: Descendant[]) => void;
  continuePolish: (instruction: string) => void;
  stopPolish: () => void;
  reset: () => void;
}

export const useContentPolish = (
  provider: LLMProviderSetting | null,
  model: LLMModelSetting | null
): UseContentPolishResult => {
  const [polishedContent, setPolishedContent] = useState<Descendant[] | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(true);
  const chatHandleRef = useRef<PiChatHandle | null>(null);
  const accumulatedMarkdownRef = useRef<string>("");
  const conversationHistoryRef = useRef<RequestMessage[]>([]);

  // 节流的解析函数
  const { run: throttledParse } = useThrottleFn(
    (markdown: string) => {
      try {
        const parsed = importFromMarkdown(markdown);
        setPolishedContent(parsed);
      } catch (err) {
        console.error("解析 Markdown 失败:", err);
      }
    },
    {
      wait: 100,
    }
  );

  const startPolish = useMemoizedFn((content: Descendant[]) => {
    if (!provider || !model) {
      setError(new Error("未配置内容润色模型"));
      return;
    }

    // 重置状态
    setIsPolishing(true);
    setError(null);
    setPolishedContent(null);
    setPending(true);
    accumulatedMarkdownRef.current = "";

    // 将内容转为 Markdown
    const markdown = getMarkdown(content);

    const systemMessage: RequestMessage = {
      role: Role.System,
      content: [
        {
          type: "text",
          text: CONTENT_POLISH_PROMPT,
        },
      ],
    };

    const userMessage: RequestMessage = {
      role: Role.User,
      content: [
        {
          type: "text",
          text: markdown,
        },
      ],
    };

    const messages: RequestMessage[] = [systemMessage, userMessage];

    // 初始化对话历史
    conversationHistoryRef.current = [systemMessage, userMessage];

    const handle = piStreamText(
      { provider, model, messages, source: { feature: "contentPolish" } },
      ({ text }) => {
        setPending(false);
        // 累积所有返回的内容
        accumulatedMarkdownRef.current = text;
        // 节流解析
        throttledParse(text);
      }
    );
    chatHandleRef.current = handle;
    void handle.result.then(result => {
      if (result.ok && !result.aborted) {
        setIsPolishing(false);
        setPending(false);
        // 最后一次强制解析确保完整
        throttledParse.flush();
        if (result.text) {
          try {
            const parsed = importFromMarkdown(result.text);
            setPolishedContent(parsed);
            conversationHistoryRef.current.push({
              role: Role.Assistant,
              content: [
                {
                  type: "text",
                  text: result.text,
                },
              ],
            });
          } catch (err) {
            console.error("最终解析失败:", err);
            setError(err as Error);
          }
        }
        return;
      }
      if (!result.aborted) {
        setIsPolishing(false);
        setError(new Error(result.error ?? "模型请求失败"));
        console.error("润色失败:", result.error);
      }
    });
  });

  const continuePolish = useMemoizedFn((instruction: string) => {
    if (!provider || !model) {
      setError(new Error("未配置内容润色模型"));
      return;
    }

    if (!polishedContent) {
      setError(new Error("请先完成初次润色"));
      return;
    }

    // 获取当前内容的 Markdown（在清空前）
    const currentMarkdown = getMarkdown(polishedContent);

    // 设置状态并清空内容，准备接收新的流式输出
    setIsPolishing(true);
    setError(null);
    setPolishedContent(null);
    accumulatedMarkdownRef.current = "";

    // 添加用户的微调指令到对话历史
    const userMessage: RequestMessage = {
      role: Role.User,
      content: [
        {
          type: "text",
          text: `请根据以下要求对内容进行微调，并输出完整的修改后全文：\n\n${instruction}\n\n当前内容：\n${currentMarkdown}`,
        },
      ],
    };

    conversationHistoryRef.current.push(userMessage);

    const handle = piStreamText(
      {
        provider,
        model,
        messages: conversationHistoryRef.current,
        source: { feature: "contentPolish" },
      },
      ({ text }) => {
        // 累积所有返回的内容
        accumulatedMarkdownRef.current = text;
        // 节流解析
        throttledParse(text);
      }
    );
    chatHandleRef.current = handle;
    void handle.result.then(result => {
      if (result.ok && !result.aborted) {
        setIsPolishing(false);
        // 最后一次强制解析确保完整
        throttledParse.flush();
        const finalMarkdown = accumulatedMarkdownRef.current;
        if (finalMarkdown) {
          try {
            const parsed = importFromMarkdown(finalMarkdown);
            setPolishedContent(parsed);
            // 添加 AI 的回复到对话历史
            conversationHistoryRef.current.push({
              role: Role.Assistant,
              content: [
                {
                  type: "text",
                  text: finalMarkdown,
                },
              ],
            });
          } catch (err) {
            console.error("最终解析失败:", err);
            setError(err as Error);
          }
        }
        return;
      }
      if (!result.aborted) {
        setIsPolishing(false);
        setError(new Error(result.error ?? "模型请求失败"));
        console.error("微调失败:", result.error);
      }
    });
  });

  const stopPolish = useCallback(() => {
    chatHandleRef.current?.cancel();
    chatHandleRef.current = null;
    setIsPolishing(false);
  }, []);

  const reset = useCallback(() => {
    stopPolish();
    setPolishedContent(null);
    setError(null);
    accumulatedMarkdownRef.current = "";
    conversationHistoryRef.current = [];
  }, [stopPolish]);

  return {
    polishedContent,
    polishPending: pending,
    setPolishedContent,
    isPolishing,
    error,
    startPolish,
    continuePolish,
    stopPolish,
    reset,
  };
};

export default useContentPolish;
