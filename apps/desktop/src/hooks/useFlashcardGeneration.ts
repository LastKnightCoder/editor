import { useState, useRef, useCallback } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { chatLLMStream } from "./useChatLLM";
import { getMarkdown } from "@/utils/markdown";
import {
  FLASHCARD_GENERATION_PROMPT,
  FLASHCARD_GENERATION_USER_PROMPT,
} from "@/constants/prompts";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { RequestMessage } from "@/types";
import type {
  FlashcardType,
  FlashcardData,
  FlashcardDifficulty,
} from "@/types/flashcard";
import { textToDescendants, parseTextWithBlanks } from "@/utils/flashcard";

export interface GeneratedFlashcard {
  id: string;
  type: FlashcardType;
  prompt: Descendant[];
  detail: Descendant[];
  difficulty: FlashcardDifficulty;
  tags: string[];
  data: FlashcardData;
  selected: boolean;
}

interface UseFlashcardGenerationResult {
  generatedCards: GeneratedFlashcard[];
  isGenerating: boolean;
  isPending: boolean;
  error: Error | null;
  rawOutput: string;
  startGeneration: (content: Descendant[]) => void;
  stopGeneration: () => void;
  toggleCardSelection: (cardId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  updateCard: (
    cardId: string,
    updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>,
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
 * Parse flashcard response from LLM output
 */
const parseFlashcardResponse = (jsonStr: string): GeneratedFlashcard[] => {
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

  return parsed.map((card) => {
    // Parse prompt - use parseTextWithBlanks for cloze type to handle {{blank:xx}} markers
    let promptDescendants: Descendant[];
    if (typeof card.prompt === "string") {
      if (card.type === "cloze") {
        // For cloze cards, parse blank markers into flashcard-blank elements
        promptDescendants = parseTextWithBlanks(card.prompt);
      } else {
        // For other types, use normal text conversion
        promptDescendants = textToDescendants(card.prompt);
      }
    } else {
      promptDescendants = card.prompt || textToDescendants("");
    }

    return {
      id: generateId(),
      type: card.type || "qa",
      prompt: promptDescendants,
      detail:
        typeof card.detail === "string"
          ? textToDescendants(card.detail || "")
          : card.detail || textToDescendants(""),
      difficulty: card.difficulty || "standard",
      tags: card.tags || [],
      data: card.data || {},
      selected: true, // Default to selected
    };
  });
};

export const useFlashcardGeneration = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
): UseFlashcardGenerationResult => {
  const [generatedCards, setGeneratedCards] = useState<GeneratedFlashcard[]>(
    [],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [rawOutput, setRawOutput] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef<string>("");

  const { run: throttledParse } = useThrottleFn(
    (text: string) => {
      setRawOutput(text);
      // Try to parse as we receive chunks
      try {
        const cards = parseFlashcardResponse(text);
        setGeneratedCards(cards);
      } catch {
        // Not yet valid JSON, continue accumulating
      }
    },
    { wait: 200 },
  );

  const startGeneration = useMemoizedFn((content: Descendant[]) => {
    if (!providerConfig || !modelConfig) {
      setError(new Error("未配置闪卡生成模型"));
      return;
    }

    setIsGenerating(true);
    setIsPending(true);
    setError(null);
    setGeneratedCards([]);
    setRawOutput("");
    accumulatedRef.current = "";

    const markdown = getMarkdown(content);

    const messages: RequestMessage[] = [
      {
        role: Role.System,
        content: [{ type: "text", text: FLASHCARD_GENERATION_PROMPT }],
      },
      {
        role: Role.User,
        content: [
          { type: "text", text: FLASHCARD_GENERATION_USER_PROMPT(markdown) },
        ],
      },
    ];

    chatLLMStream(providerConfig, modelConfig, messages, {
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
          const cards = parseFlashcardResponse(fullContent);
          setGeneratedCards(cards);
          setRawOutput(fullContent);
        } catch (err) {
          setError(
            new Error(`解析闪卡失败: ${(err as Error).message}`),
          );
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
    });
  });

  const stopGeneration = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsGenerating(false);
    setIsPending(false);
  }, []);

  const toggleCardSelection = useCallback((cardId: string) => {
    setGeneratedCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, selected: !card.selected } : card,
      ),
    );
  }, []);

  const selectAll = useCallback(() => {
    setGeneratedCards((prev) => prev.map((card) => ({ ...card, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setGeneratedCards((prev) =>
      prev.map((card) => ({ ...card, selected: false })),
    );
  }, []);

  const updateCard = useCallback(
    (
      cardId: string,
      updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>,
    ) => {
      setGeneratedCards((prev) =>
        prev.map((card) =>
          card.id === cardId ? { ...card, ...updates } : card,
        ),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    stopGeneration();
    setGeneratedCards([]);
    setError(null);
    setRawOutput("");
    accumulatedRef.current = "";
  }, [stopGeneration]);

  return {
    generatedCards,
    isGenerating,
    isPending,
    error,
    rawOutput,
    startGeneration,
    stopGeneration,
    toggleCardSelection,
    selectAll,
    deselectAll,
    updateCard,
    reset,
  };
};

export default useFlashcardGeneration;
