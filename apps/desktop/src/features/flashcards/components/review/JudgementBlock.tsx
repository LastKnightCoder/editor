import { flashcardsTranslator, useFlashcardsI18n } from "../../i18n";
import { answerJudgementErrorText } from "@/hooks/useAnswerJudgement.i18n";
import useAnswerJudgement from "@/hooks/useAnswerJudgement";
import type { Flashcard } from "@/types";
import { Sparkles } from "lucide-react";

import { JudgementList } from "./JudgementList";

export function JudgementBlock({
  judgement,
  answer,
  card,
}: {
  judgement: ReturnType<typeof useAnswerJudgement>;
  answer: string;
  card: Flashcard;
}) {
  useFlashcardsI18n();
  const { status, result, error } = judgement;
  if (status === "idle") return null;
  return (
    <div className="border-line-1 rounded-[12px] border px-3.5 py-3 text-[13px]">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        <Sparkles className="text-accent-text size-[14px]" strokeWidth={1.75} />
        {flashcardsTranslator.t("ui.aiEvaluation")}
        {status === "loading" && (
          <span className="text-ink-3 ml-1.5 inline-flex items-center gap-2 font-normal">
            <span className="border-track border-t-accent size-[13px] animate-spin rounded-full border-2" />
            {flashcardsTranslator.t("ui.comparingWithTheReferenceAnswer")}
          </span>
        )}
        {status === "success" && result && (
          <span className="text-accent-text ml-auto font-mono text-[13px]">
            {result.score} / 10
          </span>
        )}
        {status === "error" && (
          <button
            type="button"
            className="text-accent-text ml-auto text-[12px] font-normal"
            onClick={() => void judgement.judge(answer, card)}
          >
            {flashcardsTranslator.t("ui.retry")}
          </button>
        )}
      </div>
      {status === "error" && (
        <p className="text-danger mt-1">
          {(error ? answerJudgementErrorText(error) : "") ||
            flashcardsTranslator.t("ui.evaluationFailed")}
        </p>
      )}
      {status === "success" && result && (
        <>
          {result.comment && <p className="text-ink-2 mt-1">{result.comment}</p>}
          <JudgementList title={flashcardsTranslator.t("ui.strengths")} items={result.highlights} />
          <JudgementList
            title={flashcardsTranslator.t("ui.missingPoints")}
            items={result.missingPoints}
          />
          <JudgementList
            title={flashcardsTranslator.t("ui.suggestions")}
            items={result.suggestions}
          />
        </>
      )}
    </div>
  );
}
