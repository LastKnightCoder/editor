import useAnswerJudgement from "@/hooks/useAnswerJudgement";
import type { Flashcard } from "@/types";
import { cn } from "@tau/ui";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { type ReviewAnswer } from "../../model";

import { JudgementBlock } from "./JudgementBlock";

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
  const explanation = card.data.explanation?.trim();
  const qaText = answer.qa?.trim();
  const heading = "text-ink-2 mb-0.5 mt-3.5 text-[12px] font-semibold first:mt-0";

  return (
    <div className="relative mt-[22px] pt-[18px] text-[14px] leading-[1.75]">
      {/* 翻面分界：一段 accent 短刻度，不画通栏横线 */}
      <span className="bg-accent absolute left-0 top-0 h-[3px] w-8 rounded-full opacity-60" />
      {correct === true && (
        <div className="text-ok mb-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
          <CheckCircle2 className="size-[14px]" strokeWidth={2} />
          回答正确
        </div>
      )}
      {correct === false && (
        <div className="text-danger mb-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
          <XCircle className="size-[14px]" strokeWidth={2} />
          回答有误
        </div>
      )}
      <div>
        {card.type === "qa" && (
          <>
            {qaText && (
              <>
                <h4 className={heading}>你的回答</h4>
                <p className="text-ink-2 whitespace-pre-wrap">{qaText}</p>
              </>
            )}
            <h4 className={heading}>参考答案</h4>
            <p className="whitespace-pre-wrap text-[15px] font-medium">
              {card.data.answer?.trim() || "未设置参考答案"}
            </p>
            {qaText && judgement.isConfigured && (
              <JudgementBlock judgement={judgement} answer={qaText} card={card} />
            )}
          </>
        )}
        {card.type === "boolean" && (
          <>
            <h4 className={heading}>答案</h4>
            <p className="text-[15px] font-medium">
              {(card.data.booleanAnswer ?? true) ? "正确" : "错误"}
            </p>
          </>
        )}
        {explanation && (
          <>
            <h4 className={heading}>解析</h4>
            <p className="text-ink-2 whitespace-pre-wrap">{explanation}</p>
          </>
        )}
        {card.references.length > 0 && (
          <>
            <h4 className={heading}>参考资料</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                  title={ref.content ? "在侧边打开" : "原内容已删除"}
                >
                  <FileText className="size-3.5 flex-none" strokeWidth={1.75} />
                  <span className="truncate">{ref.title || "未命名资料"}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
