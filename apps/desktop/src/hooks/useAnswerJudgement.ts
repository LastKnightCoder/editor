import { useState, useCallback, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { piCompleteChat } from "@/services/piLLM";
import useLLMConfig from "./useLLMConfig";
import {
  ANSWER_JUDGEMENT_SYSTEM_PROMPT,
  buildAnswerJudgementUserPrompt,
} from "@/constants/prompts";
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

const parseJudgementResponse = (response: string): AIJudgementResult => {
  // Clean possible markdown code blocks
  let cleaned = response.trim();
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

  // Try to find JSON object
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(cleaned);

  // Validate required fields
  if (typeof parsed.score !== "number" || parsed.score < 1 || parsed.score > 10) {
    throw new Error("Invalid score");
  }

  return {
    score: Math.round(parsed.score),
    comment: parsed.comment || "",
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
    missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
};

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

  const { provider, model } = useLLMConfig("aiJudgement");
  const isConfigured = !!(provider && model);

  const judge = useMemoizedFn(async (userAnswer: string, flashcard: Flashcard) => {
    const version = ++requestVersion.current;
    if (!provider || !model) {
      setError(new Error("未配置答案评判的模型"));
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
        messages,
        source: { feature: "aiJudgement" },
      });
      if (version !== requestVersion.current) return;

      if (!outcome.ok) {
        throw new Error(outcome.error ?? "AI 评判失败");
      }
      const response = outcome.text;

      if (!response) {
        throw new Error("AI 返回空响应");
      }

      const judgementResult = parseJudgementResponse(response);
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
