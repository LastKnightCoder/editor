// 复习纸卡的两个面：正面答题态（五题型交互）/ 背面揭示态（判分、答案、解析、参考）。
// 3D 翻面外壳（flipper + ghost 堆叠）在 FlashcardReviewPage 中，这里只管面内容。

import { flashcardTranslator, flashcardErrorText, useFlashcardI18n } from "./i18n";
import { ChevronRight, Lightbulb, Paperclip } from "lucide-react";
import { RichContent } from "./RichContent";
import { extractBlanks, isBlankCorrect, type ReviewAnswer } from "./reviewFlow";
import { FLASHCARD_TYPE_META } from "./constants";
import { isEditorContentEmpty } from "../cards/editorContentUtils";
import type { Flashcard } from "./types";
import type { useAnswerJudgement } from "./useAnswerJudgement";

export interface ReviewCardFaceProps {
  card: Flashcard;
  answer: ReviewAnswer;
  onAnswerChange: (partial: Partial<ReviewAnswer>) => void;
}

/** 揭示态不需要再改作答 */
export type ReviewCardBackProps = Omit<ReviewCardFaceProps, "onAnswerChange">;

const noopBlankHandlers = {
  revealed: true as const,
  getBlankValue: () => "",
  onBlankChange: () => undefined,
};

function TypeTag({ card, extra }: { card: Flashcard; extra?: string }) {
  useFlashcardI18n();
  return (
    <div className="flex items-center justify-between">
      <span className="bg-accent-soft text-accent-text rounded-full px-2.5 py-1 text-[10.5px] font-extrabold">
        {flashcardTranslator.t(FLASHCARD_TYPE_META[card.type].labelKey)}
        {extra ? ` · ${extra}` : ""}
      </span>
    </div>
  );
}

/** 正面：题干 + 题型作答区 */
export function ReviewCardFront({ card, answer, onAnswerChange }: ReviewCardFaceProps) {
  useFlashcardI18n();
  const hint = card.data.hint?.trim();

  const renderBody = () => {
    switch (card.type) {
      case "single-choice":
      case "multiple-choice": {
        const isMultiple = card.type === "multiple-choice";
        return (
          <div className="mt-5 flex flex-col gap-2.5">
            {(card.data.options ?? []).map((option, index) => {
              const isSelected = isMultiple
                ? (answer.multipleChoice ?? []).includes(option.id)
                : answer.singleChoice === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={event => {
                    // 阻断冒泡：卡片容器绑定着“点卡片翻面”，选项点击若冒泡上去会在
                    // 选择未完成时立即翻面（且翻面闭包读到的还是不含本次选择的旧值）
                    event.stopPropagation();
                    if (isMultiple) {
                      const current = answer.multipleChoice ?? [];
                      onAnswerChange({
                        multipleChoice: current.includes(option.id)
                          ? current.filter(id => id !== option.id)
                          : [...current, option.id],
                      });
                    } else {
                      onAnswerChange({ singleChoice: option.id });
                    }
                  }}
                  className={`shadow-card flex items-center gap-3 rounded-[16px] border-2 px-4 py-3.5 text-left text-[14.5px] font-semibold transition-colors ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "bg-page active:bg-hover border-transparent"
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center rounded-[10px] text-[12.5px] font-extrabold ${
                      isSelected ? "bg-accent text-ink-inverse" : "bg-page text-ink-2"
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="leading-[1.55]">{option.label}</span>
                  {isMultiple && isSelected ? (
                    <span className="bg-tag-1 text-ink-inverse ml-auto grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] text-[11px] font-extrabold">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      }
      case "boolean":
        return (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[true, false].map(value => {
              const selected = answer.boolean === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={event => {
                    // 同选项按钮：阻断冒泡避免点击即翻面
                    event.stopPropagation();
                    onAnswerChange({ boolean: value });
                  }}
                  className={`rounded-[18px] border-2 py-4 text-center font-extrabold transition-colors ${
                    selected
                      ? value
                        ? "bg-tag-1-soft text-tag-1 border-[var(--tau-tag-1)]"
                        : "bg-tag-5-soft text-danger border-[var(--tau-danger)]"
                      : "bg-page text-ink-2 active:bg-hover border-transparent"
                  }`}
                >
                  <span className="block text-[24px] leading-none">{value ? "✓" : "✕"}</span>
                  <span className="mt-1.5 block text-[13.5px]">
                    {value ? flashcardTranslator.t("ui.true") : flashcardTranslator.t("ui.false")}
                  </span>
                </button>
              );
            })}
          </div>
        );
      case "qa":
        return (
          <div className="mt-5">
            <textarea
              value={answer.qa ?? ""}
              onChange={event => onAnswerChange({ qa: event.target.value })}
              placeholder={flashcardTranslator.t(
                "ui.recallYourAnswerThenRevealAndCompareYouCanAlso"
              )}
              rows={5}
              className="bg-page text-ink-1 placeholder:text-ink-3 focus:border-accent input-text w-full resize-none rounded-[16px] border-2 border-transparent px-4 py-3.5 leading-[1.7] font-medium outline-none"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <TypeTag card={card} />
      <div className="text-ink-1 mt-3.5 text-[17px] leading-[1.65] font-bold">
        {card.type === "cloze" ? (
          <ClozeInteractivePrompt card={card} answer={answer} onAnswerChange={onAnswerChange} />
        ) : (
          <RichContent content={card.prompt} />
        )}
      </div>
      {card.type !== "cloze" ? renderBody() : null}
      {hint ? (
        <div className="bg-page text-ink-2 mt-4 flex items-start gap-2 rounded-[14px] px-3.5 py-3 text-[12.5px] font-semibold">
          <Lightbulb size={14} className="mt-[3px] flex-none" />
          <span className="leading-[1.6]">{hint}</span>
        </div>
      ) : null}
    </>
  );
}

/** 填空题题干（行内输入态） */
function ClozeInteractivePrompt({ card, answer, onAnswerChange }: ReviewCardFaceProps) {
  useFlashcardI18n();
  return (
    <RichContent
      content={card.prompt}
      blankProps={{
        revealed: false,
        getBlankValue: blankId => answer.cloze?.[blankId] ?? "",
        onBlankChange: (blankId, value) =>
          onAnswerChange({ cloze: { ...answer.cloze, [blankId]: value } }),
      }}
    />
  );
}

/** 背面：揭示对错 + 正确答案 + 解析（参考资料条由页面固定在卡底，不随内容滚动） */
export function ReviewCardBack({
  card,
  isCorrect,
  answer,
  judgement,
}: ReviewCardBackProps & {
  isCorrect: boolean | null;
  judgement?: ReturnType<typeof useAnswerJudgement>;
}) {
  useFlashcardI18n();
  const explanation = card.data.explanation?.trim();
  // 背面补充按有无实际内容展示（空段落默认值不渲染）
  const detailEmpty = isEditorContentEmpty(card.detail);

  const renderAnswerBlock = () => {
    switch (card.type) {
      case "single-choice":
      case "multiple-choice": {
        const correctOptions = (card.data.options ?? []).filter(option => option.isCorrect);
        return (
          <div className="mt-3.5 flex flex-col gap-2">
            {(card.data.options ?? []).map((option, index) => {
              const isSelected =
                card.type === "multiple-choice"
                  ? (answer.multipleChoice ?? []).includes(option.id)
                  : answer.singleChoice === option.id;
              const showCorrect = option.isCorrect;
              const showWrong = isSelected && !option.isCorrect;
              return (
                <div
                  key={option.id}
                  className={`flex items-center gap-3 rounded-[14px] border-2 px-3.5 py-2.5 text-[13px] font-semibold ${
                    showCorrect
                      ? "bg-tag-1-soft text-tag-1 border-[var(--tau-tag-1)]"
                      : showWrong
                        ? "bg-tag-5-soft text-danger border-[var(--tau-danger)]"
                        : "bg-page/60 text-ink-3 border-transparent opacity-60"
                  }`}
                >
                  <span className="bg-page grid h-6 w-6 flex-none place-items-center rounded-[8px] text-[11.5px] font-extrabold">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="leading-[1.5]">{option.label}</span>
                  {showCorrect ? (
                    <span className="text-tag-1 ml-auto flex-none text-[10.5px] font-extrabold">
                      {flashcardTranslator.t("ui.correctAnswer")}
                    </span>
                  ) : showWrong ? (
                    <span className="text-danger ml-auto flex-none text-[10.5px] font-extrabold">
                      {flashcardTranslator.t("ui.yourChoice")}
                    </span>
                  ) : null}
                </div>
              );
            })}
            {correctOptions.length === 0 ? (
              <div className="text-ink-3 text-[12px] font-semibold">
                {flashcardTranslator.t("ui.thisCardHasNoCorrectOption")}
              </div>
            ) : null}
          </div>
        );
      }
      case "boolean":
        return (
          <div
            className="mt-3.5 inline-flex items-center gap-2 self-start rounded-[13px] px-3.5 py-2.5 text-[14px] font-extrabold"
            style={{
              background: card.data.booleanAnswer
                ? "var(--tau-tag-1-soft)"
                : "var(--tau-tag-5-soft)",
              color: card.data.booleanAnswer ? "var(--tau-tag-1)" : "var(--tau-danger)",
            }}
          >
            {card.data.booleanAnswer
              ? flashcardTranslator.t("ui.true3")
              : flashcardTranslator.t("ui.false3")}
          </div>
        );
      case "cloze":
        return (
          <div className="text-ink-1 mt-3.5 text-[15px] leading-[2.1] font-semibold">
            <RichContent
              content={card.prompt}
              blankProps={{
                ...noopBlankHandlers,
                correct: blankId => {
                  const node = extractBlanks(card.prompt).find(item => item.blankId === blankId);
                  return node ? isBlankCorrect(node, answer.cloze?.[blankId]) : true;
                },
              }}
            />
          </div>
        );
      case "qa":
        return (
          <div className="bg-page mt-3.5 rounded-[16px] px-4 py-3.5">
            <div className="text-ink-2 mb-1.5 text-[11.5px] font-extrabold">
              {flashcardTranslator.t("ui.referenceAnswer")}
            </div>
            <div className="text-ink-1 text-[14px] leading-[1.8] font-medium">
              {card.data.answer?.trim() ||
                flashcardTranslator.t("ui.noReferenceAnswerUseTheExplanationForSelfAssessment")}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div
        className="flex items-center gap-2.5 rounded-[14px] px-4 py-3 text-[14px] font-extrabold"
        style={
          isCorrect === null
            ? { background: "var(--tau-bg-page)", color: "var(--tau-ink-2)" }
            : isCorrect
              ? { background: "var(--tau-tag-1-soft)", color: "var(--tau-tag-1)" }
              : { background: "var(--tau-tag-5-soft)", color: "var(--tau-danger)" }
        }
      >
        {isCorrect === null
          ? judgement?.status === "loading"
            ? flashcardTranslator.t("ui.aiIsEvaluating")
            : flashcardTranslator.t("ui.compareWithTheReferenceAnswerToRateYourself")
          : isCorrect
            ? flashcardTranslator.t("ui.correctResponse2")
            : flashcardTranslator.t("ui.incorrectResponse2")}
      </div>
      {/* cloze 的题干在 renderAnswerBlock 里以「逐空判分高亮」形态渲染，顶部跳过以免重复且明文露答案 */}
      {card.type !== "cloze" ? (
        <div className="text-ink-1 mt-3.5 text-[15.5px] leading-[1.6] font-bold">
          <RichContent content={card.prompt} />
        </div>
      ) : null}
      {renderAnswerBlock()}
      {card.type === "qa" && judgement && judgement.status !== "idle" && (
        <div className="bg-page rounded-tau-lg text-tau-sm mt-4 space-y-2 p-4" aria-live="polite">
          <div className="text-ink-1 font-semibold">
            {flashcardTranslator.t("ui.aiEvaluation")}
            {judgement.result ? ` · ${judgement.result.score} / 10` : ""}
          </div>
          {judgement.status === "loading" && (
            <p className="text-ink-2">
              {flashcardTranslator.t("ui.comparingWithTheReferenceAnswerYouCanStillChooseYour")}
            </p>
          )}
          {judgement.status === "error" && (
            <>
              <p role="alert" className="text-danger">
                {(judgement.error ? flashcardErrorText(judgement.error) : null) ??
                  flashcardTranslator.t("ui.evaluationFailedCompareWithTheAnswerToRateYourself")}
              </p>
              <button
                type="button"
                onClick={() => void judgement.judge(answer.qa ?? "", card)}
                className="text-accent-text py-2 font-semibold"
              >
                {flashcardTranslator.t("ui.evaluateAgain")}
              </button>
            </>
          )}
          {judgement.result && (
            <>
              <p className="text-ink-2">{judgement.result.comment}</p>
              {(
                [
                  [flashcardTranslator.t("ui.strengths"), judgement.result.highlights],
                  [flashcardTranslator.t("ui.missingPoints"), judgement.result.missingPoints],
                  [flashcardTranslator.t("ui.suggestions"), judgement.result.suggestions],
                ] as const
              ).map(
                ([title, items]) =>
                  items.length > 0 && (
                    <p key={title} className="text-ink-2">
                      <span className="text-ink-1 font-semibold">{title}：</span>
                      {items.join("；")}
                    </p>
                  )
              )}
            </>
          )}
        </div>
      )}
      {!detailEmpty ? (
        <div className="text-ink-1 mt-3.5 text-[14px] leading-[1.8]">
          <div className="text-ink-2 mb-1 text-[11.5px] font-extrabold">
            {flashcardTranslator.t("ui.moreDetails")}
          </div>
          <RichContent content={card.detail} />
        </div>
      ) : null}
      {explanation ? (
        <div className="border-line-1 text-ink-2 mt-3.5 border-t border-dashed pt-3 text-[13px] leading-[1.75]">
          <b className="text-ink-1">{flashcardTranslator.t("ui.explanation2")}</b>
          {explanation}
        </div>
      ) : null}
    </>
  );
}

/** 参考资料固定条（页面钉在卡片底部，长内容滚动时始终可见） */
export function ReferenceEntry({ title, onOpen }: { title: string; onOpen: () => void }) {
  useFlashcardI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-page border-line-1 active:bg-hover flex w-full items-center gap-3 rounded-[15px] border border-dashed px-3.5 py-3 text-left"
    >
      <span className="bg-surface text-accent shadow-card grid h-9 w-9 flex-none place-items-center rounded-[11px]">
        <Paperclip size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block truncate text-[13px] font-extrabold">{title}</span>
        <span className="text-ink-3 mt-0.5 block text-[10.5px] font-bold">
          {flashcardTranslator.t("ui.referencesTapToViewSource")}
        </span>
      </span>
      <ChevronRight size={16} className="text-ink-3 flex-none" />
    </button>
  );
}
