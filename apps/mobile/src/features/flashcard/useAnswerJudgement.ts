import { useCallback, useEffect, useRef, useState } from "react";
import type { AIJudgementResult } from "@tau/ai/flashcards";
import { useAppContext } from "../../app/AppContext";
import { findAssignedModel } from "../../services/ai-settings";
import { judgeFlashcardAnswer } from "../../services/flashcardJudgement";
import type { Flashcard } from "./types";

type JudgementState = {
  status: "idle" | "loading" | "success" | "error";
  result: AIJudgementResult | null;
  error: Error | null;
};
const IDLE: JudgementState = { status: "idle", result: null, error: null };

export function useAnswerJudgement() {
  const setting = useAppContext().syncSettings.safeSetting;
  const assigned = findAssignedModel(setting, "flashcardGeneration");
  const databaseName = setting?.database?.active ?? "";
  const providerId = assigned?.provider.id;
  const modelId = assigned?.model.id;
  const [state, setState] = useState(IDLE);
  const active = useRef<AbortController | null>(null);
  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setState(IDLE);
  }, []);
  useEffect(() => reset, [reset, databaseName, providerId, modelId]);

  const judge = useCallback(
    async (userAnswer: string, card: Flashcard) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setState({ status: "loading", result: null, error: null });
      try {
        if (!providerId || !modelId || !databaseName) throw new Error("请先在设置中配置闪卡模型");
        const result = await judgeFlashcardAnswer(
          card,
          userAnswer,
          databaseName,
          { providerId, modelId },
          controller.signal
        );
        if (!controller.signal.aborted && active.current === controller)
          setState({ status: "success", result, error: null });
      } catch (error) {
        if (!controller.signal.aborted && active.current === controller)
          setState({
            status: "error",
            result: null,
            error: error instanceof Error ? error : new Error("AI 评判失败"),
          });
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [databaseName, providerId, modelId]
  );
  return { ...state, isConfigured: !!(databaseName && providerId && modelId), judge, reset };
}
