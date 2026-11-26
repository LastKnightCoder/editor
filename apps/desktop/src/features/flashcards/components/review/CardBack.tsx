import { flashcardsTranslator, useFlashcardsI18n } from "../../i18n";
import useAnswerJudgement from "@/hooks/useAnswerJudgement";
import type { Flashcard } from "@/types";
import { cn } from "@tau/ui";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { type ReviewAnswer } from "../../model";

import { JudgementBlock } from "./JudgementBlock";

/**
 * 翻面：两层结构，块与块有明确边界——
 * ① 结果块（浅底卡片，即翻面分界）：判定 + 答案（判断题 / 问答题）；选择 / 填空的正确项已标在题面，只放判定；
 * ② 说明区：「左标签 · 右内容」行，行间细线分隔（你的回答 / 解析 / 参考资料），AI 评判自带卡片整宽插在其中。
 */
export function CardBack({
  card,
  answer,
  correct,
  judgement,
  activeRef,
  onOpenRef,
}: {
  card: Flashcard;
  answer: ReviewAnswer;
  correct: boolean | null;
  judgement: ReturnType<typeof useAnswerJudgement>;
  activeRef: number | null;
  onOpenRef(id: number | null): void;
}) {
  useFlashcardsI18n();
  const explanation = card.data.explanation?.trim();
  const qaText = answer.qa?.trim();

  const answerValue =
    card.type === "qa"
      ? card.data.answer?.trim() || flashcardsTranslator.t("ui.noReferenceAnswer")
      : card.type === "boolean"
        ? (card.data.booleanAnswer ?? true)
          ? flashcardsTranslator.t("ui.true")
          : flashcardsTranslator.t("ui.false")
        : null;

  return (
    <div className="mt-7 flex flex-col gap-4 text-[14px] leading-[1.75]">
      {(correct !== null || answerValue !== null) && (
        <div
          className={cn(
            "rounded-[12px] px-4 py-3",
            correct === true ? "bg-ok-soft" : correct === false ? "bg-danger-soft" : "bg-hover"
          )}
        >
          {correct !== null && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 text-[13px] font-semibold",
                correct ? "text-ok" : "text-danger"
              )}
            >
              {correct ? (
                <CheckCircle2 className="size-[15px]" strokeWidth={2} />
              ) : (
                <XCircle className="size-[15px]" strokeWidth={2} />
              )}
              {correct
                ? flashcardsTranslator.t("ui.correctResponse")
                : flashcardsTranslator.t("ui.incorrectResponse")}
            </div>
          )}
          {answerValue !== null && (
            <div className={cn(correct !== null && "mt-1")}>
              <div className="text-ink-3 text-[12px]">
                {card.type === "qa"
                  ? flashcardsTranslator.t("ui.referenceAnswer")
                  : flashcardsTranslator.t("ui.answer")}
              </div>
              <p className="text-ink-1 text-[16px] leading-[1.7] font-medium whitespace-pre-wrap">
                {answerValue}
              </p>
            </div>
          )}
        </div>
      )}

      {card.type === "qa" && qaText && (
        <Row label={flashcardsTranslator.t("ui.yourAnswer")}>{qaText}</Row>
      )}
      {card.type === "qa" && qaText && judgement.isConfigured && (
        <JudgementBlock judgement={judgement} answer={qaText} card={card} />
      )}
      {explanation && <Row label={flashcardsTranslator.t("ui.explanation")}>{explanation}</Row>}
      {card.references.length > 0 && (
        <Row label={flashcardsTranslator.t("ui.references")}>
          <div className="flex flex-wrap gap-1.5">
            {card.references.map(ref => (
              <button
                key={ref.id}
                type="button"
                disabled={!ref.content}
                onClick={() => onOpenRef(activeRef === ref.id ? null : ref.id)}
                className={cn(
                  "border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-7 max-w-full items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] disabled:opacity-60",
                  activeRef === ref.id && "bg-hover text-ink-1"
                )}
                title={
                  ref.content
                    ? flashcardsTranslator.t("ui.openInSidePanel")
                    : flashcardsTranslator.t("ui.sourceContentDeleted")
                }
              >
                <FileText className="size-3.5 flex-none" strokeWidth={1.75} />
                <span className="truncate">
                  {ref.title || flashcardsTranslator.t("ui.untitledReference")}
                </span>
              </button>
            ))}
          </div>
        </Row>
      )}
    </div>
  );
}

/** 说明行：左侧定宽灰标签，右侧内容；上沿细线与上一块分开 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  useFlashcardsI18n();
  return (
    <section className="border-line-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 border-t pt-4">
      <h4 className="text-ink-3 pt-px text-[12.5px] leading-[1.75]">{label}</h4>
      <div className="text-ink-2 min-w-0 whitespace-pre-wrap">{children}</div>
    </section>
  );
}
