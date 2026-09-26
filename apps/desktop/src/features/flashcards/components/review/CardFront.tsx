import type { Flashcard } from "@/types";
import { extractPlainText } from "@/utils/flashcard";
import { Textarea } from "@tau/ui";
import { Lightbulb } from "lucide-react";
import { type ReviewAnswer } from "../../model";
import { MOD } from "../../overlay";
import { ClozePrompt, RichContent } from "../CardContent";

import { LETTERS } from "../../reviewStyles";
import { OptionButton } from "./OptionButton";

export function CardFront({
  card,
  answer,
  revealed,
  hintShown,
  onShowHint,
  onAnswer,
  onPick,
  onSubmit,
}: {
  card: Flashcard;
  answer: ReviewAnswer;
  revealed: boolean;
  hintShown: boolean;
  onShowHint(): void;
  onAnswer(answer: ReviewAnswer): void;
  onPick(id: string): void;
  onSubmit(override?: ReviewAnswer): void;
}) {
  const options = card.data.options ?? [];
  const hasDetail = extractPlainText(card.detail ?? []).trim().length > 0;
  const hint = card.data.hint?.trim();

  return (
    <>
      <div className="text-[20px] font-medium leading-[1.8]">
        {card.type === "cloze" ? (
          <ClozePrompt
            content={card.prompt}
            values={answer.cloze ?? {}}
            revealed={revealed}
            onChange={(id, value) => onAnswer({ cloze: { ...(answer.cloze ?? {}), [id]: value } })}
            onSubmit={() => onSubmit()}
          />
        ) : (
          <RichContent content={card.prompt} />
        )}
      </div>
      {hasDetail && <RichContent content={card.detail} className="text-ink-2 mt-2 text-[13.5px]" />}
      {hint && !revealed && (
        <div className="text-ink-3 mt-2.5 flex items-center gap-1.5 text-[12.5px]">
          <Lightbulb className="size-[13px]" strokeWidth={1.75} />
          {hintShown ? (
            hint
          ) : (
            <button type="button" className="text-accent-text" onClick={onShowHint}>
              显示提示
            </button>
          )}
        </div>
      )}

      {(card.type === "single-choice" || card.type === "multiple-choice") && (
        <div className="mt-[22px] flex flex-col gap-2">
          {options.map((option, i) => {
            const multi = card.type === "multiple-choice";
            const chosen = multi
              ? (answer.multi ?? []).includes(option.id)
              : answer.single === option.id;
            const state = revealed
              ? option.isCorrect
                ? "right"
                : chosen
                  ? "wrong"
                  : "dim"
              : chosen
                ? "sel"
                : "idle";
            return (
              <OptionButton
                key={option.id}
                letter={LETTERS[i]}
                square={multi}
                state={state}
                disabled={revealed}
                onClick={() => onPick(option.id)}
                note={revealed && (option.isCorrect || chosen) ? option.explanation : undefined}
              >
                {option.label || "（空选项）"}
              </OptionButton>
            );
          })}
        </div>
      )}

      {card.type === "boolean" && (
        <div className="mt-[22px] grid grid-cols-2 gap-2.5">
          {[true, false].map((value, i) => {
            const chosen = answer.bool === value;
            const truth = card.data.booleanAnswer ?? true;
            const state = revealed
              ? value === truth
                ? "right"
                : chosen
                  ? "wrong"
                  : "dim"
              : chosen
                ? "sel"
                : "idle";
            return (
              <OptionButton
                key={String(value)}
                letter={LETTERS[i]}
                state={state}
                disabled={revealed}
                center
                onClick={() => onSubmit({ bool: value })}
              >
                {value ? "正确" : "错误"}
              </OptionButton>
            );
          })}
        </div>
      )}

      {/* 外距挂外层：Textarea 的 className 落在内部 textarea 上，写 mt 会变成框内空白 */}
      {card.type === "qa" && !revealed && (
        <div className={hint ? "mt-2" : "mt-4"}>
          <Textarea
            className="min-h-[96px] px-1.5 py-0.5 text-[14px]"
            placeholder={`先在心里或这里作答，再显示答案（可留空；${MOD}↵ 提交）`}
            value={answer.qa ?? ""}
            onChange={e => onAnswer({ qa: e.target.value })}
            onKeyDown={e => {
              // 作答按键留在输入框，Esc 继续交给页面浮层仲裁。
              if (e.key !== "Escape") e.stopPropagation();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
        </div>
      )}
    </>
  );
}
