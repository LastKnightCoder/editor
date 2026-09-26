import { useState, useRef, useCallback } from "react";
import { Descendant } from "slate";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { chatLLMStream } from "./useChatLLM";
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
  const controllerRef = useRef<AbortController | null>(null);
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

    chatLLMStream(provider, model, messages, {
      onUpdate: (responseText: string, _fetchText: string) => {
        setPending(false);
        // 累积所有返回的内容
        accumulatedMarkdownRef.current = responseText;
        // 节流解析
        throttledParse(responseText);
      },
      onFinish: (fullContent: string) => {
        setIsPolishing(false);
        setPending(false);
        // 最后一次强制解析确保完整
        throttledParse.flush();
        if (fullContent) {
          try {
            const parsed = importFromMarkdown(fullContent);
            setPolishedContent(parsed);
            conversationHistoryRef.current.push({
              role: Role.Assistant,
              content: [
                {
                  type: "text",
                  text: fullContent,
                },
              ],
            });
          } catch (err) {
            console.error("最终解析失败:", err);
            setError(err as Error);
          }
        }
      },
      onError: (err: Error) => {
        setIsPolishing(false);
        setError(err);
        console.error("润色失败:", err);
      },
      onController: (controller: AbortController) => {
        controllerRef.current = controller;
      },
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

    chatLLMStream(provider, model, conversationHistoryRef.current, {
      onUpdate: (responseText: string, _fetchText: string) => {
        // 累积所有返回的内容
        accumulatedMarkdownRef.current = responseText;
        // 节流解析
        throttledParse(responseText);
      },
      onFinish: () => {
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
      },
      onError: (err: Error) => {
        setIsPolishing(false);
        setError(err);
        console.error("微调失败:", err);
      },
      onController: (controller: AbortController) => {
        controllerRef.current = controller;
      },
    });
  });

  const stopPolish = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
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
