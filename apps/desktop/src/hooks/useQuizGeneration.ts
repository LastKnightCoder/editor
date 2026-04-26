import { useState, useRef, useCallback } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { getMarkdown } from "@/utils/markdown";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { ToolCallExecutionState } from "@/types";
import type { GeneratedQuizItem } from "@/types/vl-quiz";
import { textToDescendants, parseTextWithBlanks } from "@/utils/flashcard";
import { runGenerationTask } from "@/services/generation-orchestrator";

interface UseQuizGenerationOptions {
  enableTools?: boolean;
  onToolCallsUpdate?: (executions: ToolCallExecutionState[]) => void;
}

interface UseQuizGenerationResult {
  generatedItems: GeneratedQuizItem[];
  isGenerating: boolean;
  isPending: boolean;
  error: Error | null;
  rawOutput: string;
  toolExecutions: ToolCallExecutionState[];
  startGeneration: (content: string, userPrompt?: string) => void;
  startGenerationFromDescendants: (
    content: Descendant[],
    userPrompt?: string,
  ) => void;
  startGenerationWithTools: (
    resourceNames: string[],
    userPrompt?: string,
  ) => void;
  stopGeneration: () => void;
  toggleItemSelection: (itemId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  updateItem: (
    itemId: string,
    updates: Partial<Omit<GeneratedQuizItem, "id" | "selected">>,
  ) => void;
  reset: () => void;
}

const generateId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Parse quiz response from LLM output
 */
const parseQuizResponse = (jsonStr: string): GeneratedQuizItem[] => {
  // Clean up potential markdown code blocks
  let cleaned = jsonStr.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Try to find JSON array in the content
  const startIdx = cleaned.indexOf("[");
  const endIdx = cleaned.lastIndexOf("]");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not an array");
  }

  return parsed.map((item) => {
    // Parse prompt - use parseTextWithBlanks for cloze type to handle {{blank:xx}} markers
    let promptDescendants: Descendant[];
    if (typeof item.prompt === "string") {
      if (item.type === "cloze") {
        // For cloze items, parse blank markers into flashcard-blank elements
        promptDescendants = parseTextWithBlanks(item.prompt);
      } else {
        // For other types, use normal text conversion
        promptDescendants = textToDescendants(item.prompt);
      }
    } else {
      promptDescendants = item.prompt || textToDescendants("");
    }

    return {
      id: generateId(),
      type: item.type || "qa",
      prompt: promptDescendants,
      detail:
        typeof item.detail === "string"
          ? textToDescendants(item.detail || "")
          : item.detail || textToDescendants(""),
      difficulty: item.difficulty || "standard",
      tags: item.tags || [],
      data: item.data || {},
      selected: true, // Default to selected
    };
  });
};

export const useQuizGeneration = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
  options?: UseQuizGenerationOptions,
): UseQuizGenerationResult => {
  const { enableTools = false, onToolCallsUpdate } = options || {};

  const [generatedItems, setGeneratedItems] = useState<GeneratedQuizItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [rawOutput, setRawOutput] = useState("");
  const [toolExecutions, setToolExecutions] = useState<
    ToolCallExecutionState[]
  >([]);
  const controllerRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef<string>("");

  const { run: throttledParse } = useThrottleFn(
    (text: string) => {
      setRawOutput(text);
      // Try to parse as we receive chunks
      try {
        const items = parseQuizResponse(text);
        setGeneratedItems(items);
      } catch {
        // Not yet valid JSON, continue accumulating
      }
    },
    { wait: 200 },
  );

  const doStartGeneration = useMemoizedFn(
    (markdownContent: string, userPrompt?: string) => {
      if (!providerConfig || !modelConfig) {
        setError(new Error("未配置测验生成模型"));
        return;
      }

      setIsGenerating(true);
      setIsPending(true);
      setError(null);
      setGeneratedItems([]);
      setRawOutput("");
      accumulatedRef.current = "";

      runGenerationTask(
        providerConfig,
        modelConfig,
        {
          taskType: "quiz",
          sourceType: "provided_content",
          taskPayload: {},
          sourcePayload: {
            content: markdownContent,
            userPrompt,
          },
        },
        {
          onUpdate: (responseText: string) => {
            setIsPending(false);
            accumulatedRef.current = responseText;
            throttledParse(responseText);
          },
          onFinish: (fullContent: string) => {
            setIsGenerating(false);
            setIsPending(false);
            throttledParse.flush();

            try {
              const items = parseQuizResponse(fullContent);
              setGeneratedItems(items);
              setRawOutput(fullContent);
            } catch (err) {
              setError(new Error(`解析测验题失败: ${(err as Error).message}`));
              setRawOutput(fullContent);
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
        },
      );
    },
  );

  const startGeneration = useMemoizedFn(
    (content: string, userPrompt?: string) => {
      doStartGeneration(content, userPrompt);
    },
  );

  const startGenerationFromDescendants = useMemoizedFn(
    (content: Descendant[], userPrompt?: string) => {
      const markdown = getMarkdown(content);
      doStartGeneration(markdown, userPrompt);
    },
  );

  // 使用工具模式生成测验（AI 自主获取资料内容）
  const startGenerationWithTools = useMemoizedFn(
    (resourceNames: string[], userPrompt?: string) => {
      if (!providerConfig || !modelConfig) {
        setError(new Error("未配置测验生成模型"));
        return;
      }

      if (!enableTools) {
        setError(new Error("工具模式未启用"));
        return;
      }

      setIsGenerating(true);
      setIsPending(true);
      setError(null);
      setGeneratedItems([]);
      setRawOutput("");
      setToolExecutions([]);
      accumulatedRef.current = "";

      runGenerationTask(
        providerConfig,
        modelConfig,
        {
          taskType: "quiz",
          sourceType: "vibe_learning",
          taskPayload: {},
          sourcePayload: {
            resourceNames,
            userPrompt,
          },
        },
        {
          onToolCallsUpdate: (executions: ToolCallExecutionState[]) => {
            setToolExecutions(executions);
            onToolCallsUpdate?.(executions);
          },
          onUpdate: (responseText: string) => {
            setIsPending(false);
            accumulatedRef.current = responseText;
            throttledParse(responseText);
          },
          onFinish: (fullContent: string) => {
            setIsGenerating(false);
            setIsPending(false);
            throttledParse.flush();

            try {
              const items = parseQuizResponse(fullContent);
              setGeneratedItems(items);
              setRawOutput(fullContent);
            } catch (err) {
              setError(new Error(`解析测验题失败: ${(err as Error).message}`));
              setRawOutput(fullContent);
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
        },
      );
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

  const toggleItemSelection = useCallback((itemId: string) => {
    setGeneratedItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item,
      ),
    );
  }, []);

  const selectAll = useCallback(() => {
    setGeneratedItems((prev) =>
      prev.map((item) => ({ ...item, selected: true })),
    );
  }, []);

  const deselectAll = useCallback(() => {
    setGeneratedItems((prev) =>
      prev.map((item) => ({ ...item, selected: false })),
    );
  }, []);

  const updateItem = useCallback(
    (
      itemId: string,
      updates: Partial<Omit<GeneratedQuizItem, "id" | "selected">>,
    ) => {
      setGeneratedItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item,
        ),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    stopGeneration();
    setGeneratedItems([]);
    setError(null);
    setRawOutput("");
    setToolExecutions([]);
    accumulatedRef.current = "";
  }, [stopGeneration]);

  return {
    generatedItems,
    isGenerating,
    isPending,
    error,
    rawOutput,
    toolExecutions,
    startGeneration,
    startGenerationFromDescendants,
    startGenerationWithTools,
    stopGeneration,
    toggleItemSelection,
    selectAll,
    deselectAll,
    updateItem,
    reset,
  };
};

export default useQuizGeneration;
