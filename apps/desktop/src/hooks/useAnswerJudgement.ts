import { useState, useCallback, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { piCompleteChat } from "@/services/piLLM";
import useLLMConfig from "./useLLMConfig";
import {
  ANSWER_JUDGEMENT_SYSTEM_PROMPT,
  buildAnswerJudgementUserPrompt,
  parseAnswerJudgementResponse,
} from "@tau/ai/flashcards";
import { Role } from "@/constants";
import type { RequestMessage } from "@/types";
import type { AIJudgementResult, AIJudgementStatus, Flashcard } from "@/types/flashcard";
import { extractPlainText } from "@/utils/flashcard";

interface UseAnswerJudgementResult {
  status: AIJudgementStatus;
  result: AIJudgementResult | null;
  error: Error | null;
  isConfigured: boolean;
  judge: (userAnswer: string, flashcard: Flashcard) => Promise<void>;
  reset: () => void;
}

export const useAnswerJudgement = (): UseAnswerJudgementResult => {
  const [status, setStatus] = useState<AIJudgementStatus>("idle");
  const [result, setResult] = useState<AIJudgementResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const requestVersion = useRef(0);
  useEffect(
    () => () => {
      requestVersion.current++;
    },
    []
  );

  const {
    provider,
    model,
    thinkingLevel: flashcardThinkingLevel,
  } = useLLMConfig("flashcardGeneration");
  const isConfigured = !!(provider && model);

  const judge = useMemoizedFn(async (userAnswer: string, flashcard: Flashcard) => {
    const version = ++requestVersion.current;
    if (!provider || !model) {
      setError(new Error("请先在设置中配置闪卡模型"));
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      // Extract question text
      const question = extractPlainText(flashcard.prompt);

      // Reference answer
      const referenceAnswer = flashcard.data.answer || "未设置参考答案";

      // Reference material (if any)
      let referenceMaterial = "";
      if (flashcard.referenceSummary) {
        referenceMaterial = flashcard.referenceSummary;
      } else if (flashcard.references && flashcard.references.length > 0) {
        // Extract content from references
        referenceMaterial = flashcard.references
          .flatMap(ref => (ref.content ? [extractPlainText(ref.content.content)] : []))
          .join("\n\n---\n\n");
      }

      const messages: RequestMessage[] = [
        {
          role: Role.System,
          content: ANSWER_JUDGEMENT_SYSTEM_PROMPT,
        },
        {
          role: Role.User,
          content: buildAnswerJudgementUserPrompt(
            question,
            userAnswer,
            referenceAnswer,
            referenceMaterial || undefined
          ),
        },
      ];

      const outcome = await piCompleteChat({
        provider,
        model,
        ...(flashcardThinkingLevel ? { thinking: flashcardThinkingLevel } : {}),
        messages,
        source: { feature: "flashcardGeneration" },
      });
      if (version !== requestVersion.current) return;

      if (!outcome.ok) {
        throw new Error(outcome.error ?? "AI 评判失败");
      }
      const response = outcome.text;

      if (!response) {
        throw new Error("AI 返回空响应");
      }

      const judgementResult = parseAnswerJudgementResponse(response);
      setResult(judgementResult);
      setStatus("success");
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(err as Error);
      setStatus("error");
      console.error("AI 评判失败:", err);
    }
  });

  const reset = useCallback(() => {
    requestVersion.current++;
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    result,
    error,
    isConfigured,
    judge,
    reset,
  };
};

export default useAnswerJudgement;
