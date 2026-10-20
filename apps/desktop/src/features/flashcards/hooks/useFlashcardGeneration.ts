import { useState, useRef, useCallback, useEffect } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { piStreamText, type PiChatHandle } from "@/services/piLLM";
import { getMarkdown } from "@/utils/markdown";
import { FLASHCARD_GENERATION_PROMPT, FLASHCARD_GENERATION_USER_PROMPT } from "@/constants/prompts";
import { Role } from "@/constants";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { RequestMessage } from "@/types";
import type { FlashcardType, FlashcardData, FlashcardDifficulty } from "@/types/flashcard";
import { parseFlashcardResponse } from "../generation/parse";

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
  removeCard: (cardId: string) => void;
  updateCard: (
    cardId: string,
    updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>
  ) => void;
  reset: () => void;
}

export const useFlashcardGeneration = (
  provider: LLMProviderSetting | null,
  model: LLMModelSetting | null
): UseFlashcardGenerationResult => {
  const [generatedCards, setGeneratedCards] = useState<GeneratedFlashcard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [rawOutput, setRawOutput] = useState("");
  const chatHandleRef = useRef<PiChatHandle | null>(null);
  const accumulatedRef = useRef<string>("");
  const generationRevision = useRef(0);

  const { run: throttledParse, cancel: cancelParse } = useThrottleFn(
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
    { wait: 200 }
  );

  const startGeneration = useMemoizedFn((content: Descendant[]) => {
    if (!provider || !model) {
      setError(new Error("未配置闪卡生成模型"));
      return;
    }

    const revision = ++generationRevision.current;
    chatHandleRef.current?.cancel();
    cancelParse();
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
        content: [{ type: "text", text: FLASHCARD_GENERATION_USER_PROMPT(markdown) }],
      },
    ];

    const handle = piStreamText(
      { provider, model, messages, source: { feature: "flashcardGeneration" } },
      ({ text }) => {
        if (revision !== generationRevision.current) return;
        setIsPending(false);
        accumulatedRef.current = text;
        throttledParse(text);
      }
    );
    chatHandleRef.current = handle;
    void handle.result.then(result => {
      if (revision !== generationRevision.current) return;
      chatHandleRef.current = null;
      if (result.ok && !result.aborted) {
        setIsGenerating(false);
        setIsPending(false);
        throttledParse.flush();

        try {
          const cards = parseFlashcardResponse(result.text);
          setGeneratedCards(cards);
          setRawOutput(result.text);
        } catch (err) {
          setError(new Error(`解析闪卡失败: ${(err as Error).message}`));
          setRawOutput(result.text);
        }
        return;
      }
      if (!result.aborted) {
        setIsGenerating(false);
        setIsPending(false);
        setError(new Error(result.error ?? "模型请求失败"));
      }
    });
  });

  const stopGeneration = useCallback(() => {
    generationRevision.current++;
    cancelParse();
    chatHandleRef.current?.cancel();
    chatHandleRef.current = null;
    setIsGenerating(false);
    setIsPending(false);
  }, [cancelParse]);

  useEffect(() => stopGeneration, [stopGeneration]);

  const toggleCardSelection = useCallback((cardId: string) => {
    setGeneratedCards(prev =>
      prev.map(card => (card.id === cardId ? { ...card, selected: !card.selected } : card))
    );
  }, []);

  const selectAll = useCallback(() => {
    setGeneratedCards(prev => prev.map(card => ({ ...card, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setGeneratedCards(prev => prev.map(card => ({ ...card, selected: false })));
  }, []);
  const removeCard = useCallback((cardId: string) => {
    setGeneratedCards(prev => prev.filter(card => card.id !== cardId));
  }, []);

  const updateCard = useCallback(
    (cardId: string, updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>) => {
      setGeneratedCards(prev =>
        prev.map(card => (card.id === cardId ? { ...card, ...updates } : card))
      );
    },
    []
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
    removeCard,
    updateCard,
    reset,
  };
};

export default useFlashcardGeneration;
