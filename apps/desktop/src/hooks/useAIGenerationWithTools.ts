import { useState, useRef, useCallback } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { chatLLMStream } from "./useChatLLM";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { RequestMessage, ToolCallExecutionState } from "@/types";

export interface UseAIGenerationOptions<T = string> {
  /** System Prompt */
  systemPrompt: string;
  /** 构建用户消息的函数 */
  buildUserPrompt: (resourceNames: string[], userPrompt?: string) => string;
  /** 可选的输出解析器，用于将原始输出转换为结构化数据 */
  parseOutput?: (output: string) => T;
  /** 工具调用状态更新回调 */
  onToolCallsUpdate?: (executions: ToolCallExecutionState[]) => void;
  /** 节流解析的等待时间（毫秒），默认 200 */
  throttleWait?: number;
}

export interface UseAIGenerationResult<T = string> {
  /** 原始输出文本 */
  output: string;
  /** 解析后的输出（如果提供了 parseOutput） */
  parsedOutput: T | null;
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 是否等待首次响应 */
  isPending: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 工具调用执行状态列表 */
  toolExecutions: ToolCallExecutionState[];
  /** 开始生成（带工具模式） */
  startGeneration: (resourceNames: string[], userPrompt?: string) => void;
  /** 停止生成 */
  stopGeneration: () => void;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 通用的带工具支持的 AI 生成 Hook
 *
 * 提供统一的 AI 生成流程，支持：
 * - 工具调用模式（AI 自主获取资料）
 * - 流式输出
 * - 可选的输出解析
 * - 工具调用状态追踪
 *
 * @example
 * ```tsx
 * const { output, isGenerating, startGeneration } = useAIGenerationWithTools(
 *   providerConfig,
 *   modelConfig,
 *   {
 *     systemPrompt: OUTLINE_GENERATION_PROMPT,
 *     buildUserPrompt: (names, prompt) => `生成大纲: ${names.join(", ")}`,
 *     onToolCallsUpdate: setToolExecutions,
 *   }
 * );
 * ```
 */
export const useAIGenerationWithTools = <T = string>(
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
  options: UseAIGenerationOptions<T>,
): UseAIGenerationResult<T> => {
  const {
    systemPrompt,
    buildUserPrompt,
    parseOutput,
    onToolCallsUpdate,
    throttleWait = 200,
  } = options;

  const [output, setOutput] = useState("");
  const [parsedOutput, setParsedOutput] = useState<T | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [toolExecutions, setToolExecutions] = useState<
    ToolCallExecutionState[]
  >([]);

  const controllerRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef<string>("");

  // 节流更新输出和解析
  const { run: throttledUpdate } = useThrottleFn(
    (text: string) => {
      setOutput(text);
      // 尝试解析输出
      if (parseOutput) {
        try {
          const parsed = parseOutput(text);
          setParsedOutput(parsed);
        } catch {
          // 解析失败，继续累积
        }
      }
    },
    { wait: throttleWait },
  );

  const startGeneration = useMemoizedFn(
    (resourceNames: string[], userPrompt?: string) => {
      if (!providerConfig || !modelConfig) {
        setError(new Error("未配置 AI 模型"));
        return;
      }

      // 重置状态
      setIsGenerating(true);
      setIsPending(true);
      setError(null);
      setOutput("");
      setParsedOutput(null);
      setToolExecutions([]);
      accumulatedRef.current = "";

      const messages: RequestMessage[] = [
        {
          role: Role.System,
          content: [{ type: "text", text: systemPrompt }],
        },
        {
          role: Role.User,
          content: [
            {
              type: "text",
              text: buildUserPrompt(resourceNames, userPrompt),
            },
          ],
        },
      ];

      chatLLMStream(providerConfig, modelConfig, messages, {
        enableTools: true,
        onToolCallsUpdate: (executions: ToolCallExecutionState[]) => {
          setToolExecutions(executions);
          onToolCallsUpdate?.(executions);
        },
        onUpdate: (responseText: string) => {
          setIsPending(false);
          accumulatedRef.current = responseText;
          throttledUpdate(responseText);
        },
        onFinish: (fullContent: string) => {
          setIsGenerating(false);
          setIsPending(false);
          throttledUpdate.flush();
          setOutput(fullContent);

          // 最终解析
          if (parseOutput) {
            try {
              const parsed = parseOutput(fullContent);
              setParsedOutput(parsed);
            } catch (err) {
              setError(new Error(`解析输出失败: ${(err as Error).message}`));
            }
          }
        },
        onError: (err: Error) => {
          setIsGenerating(false);
          setIsPending(false);
          setError(err);
        },
        onController: (controller: AbortController) => {
          controllerRef.current = controller;
        },
      });
    },
  );

  const stopGeneration = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsGenerating(false);
    setIsPending(false);
  }, []);

  const reset = useCallback(() => {
    stopGeneration();
    setOutput("");
    setParsedOutput(null);
    setError(null);
    setToolExecutions([]);
    accumulatedRef.current = "";
  }, [stopGeneration]);

  return {
    output,
    parsedOutput,
    isGenerating,
    isPending,
    error,
    toolExecutions,
    startGeneration,
    stopGeneration,
    reset,
  };
};

export default useAIGenerationWithTools;
