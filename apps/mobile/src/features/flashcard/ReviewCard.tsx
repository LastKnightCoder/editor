// 复习纸卡的两个面：正面答题态（五题型交互）/ 背面揭示态（判分、答案、解析、参考）。
// 3D 翻面外壳（flipper + ghost 堆叠）在 FlashcardReviewPage 中，这里只管面内容。

import { ChevronRight, Lightbulb, Paperclip } from "lucide-react";
import { RichContent } from "./RichContent";
import { extractBlanks, isBlankCorrect, type ReviewAnswer } from "./reviewFlow";
import { FLASHCARD_TYPE_META } from "./constants";
import { isEditorContentEmpty } from "../cards/editorContentUtils";
import type { Flashcard } from "./types";

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
  return (
    <div className="flex items-center justify-between">
      <span className="bg-accent-soft text-accent-text rounded-full px-2.5 py-1 text-[10.5px] font-extrabold">
        {FLASHCARD_TYPE_META[card.type].label}
        {extra ? ` · ${extra}` : ""}
      </span>
    </div>
  );
}

/** 正面：题干 + 题型作答区 */
export function ReviewCardFront({ card, answer, onAnswerChange }: ReviewCardFaceProps) {
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
                  <span className="mt-1.5 block text-[13.5px]">{value ? "正确" : "错误"}</span>
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
              placeholder="先凭记忆作答，再翻面对照（也可以直接翻面自评）"
              rows={5}
              className="bg-page text-ink-1 placeholder:text-ink-3 focus:border-accent input-text w-full resize-none rounded-[16px] border-2 border-transparent px-4 py-3.5 font-medium leading-[1.7] outline-none"
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
      <div className="text-ink-1 mt-3.5 text-[17px] font-bold leading-[1.65]">
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
}: ReviewCardBackProps & {
  isCorrect: boolean;
}) {
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
                      正确答案
                    </span>
                  ) : showWrong ? (
                    <span className="text-danger ml-auto flex-none text-[10.5px] font-extrabold">
                      你的选择
                    </span>
                  ) : null}
                </div>
              );
            })}
            {correctOptions.length === 0 ? (
              <div className="text-ink-3 text-[12px] font-semibold">该卡片未设置正确选项</div>
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
            {card.data.booleanAnswer ? "✓ 正确" : "✕ 错误"}
          </div>
        );
      case "cloze":
        return (
          <div className="text-ink-1 mt-3.5 text-[15px] font-semibold leading-[2.1]">
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
            <div className="text-ink-2 mb-1.5 text-[11.5px] font-extrabold">参考答案</div>
            <div className="text-ink-1 text-[14px] font-medium leading-[1.8]">
              {card.data.answer?.trim() || "（未设置参考答案，请结合解析自评）"}
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
          isCorrect
            ? { background: "var(--tau-tag-1-soft)", color: "var(--tau-tag-1)" }
            : { background: "var(--tau-tag-5-soft)", color: "var(--tau-danger)" }
        }
      >
        {isCorrect ? "✓ 回答正确" : "✕ 回答错误"}
        {card.type === "qa" ? (
          <span className="font-bold opacity-70">（请对照参考答案自评）</span>
        ) : null}
      </div>
      {/* cloze 的题干在 renderAnswerBlock 里以「逐空判分高亮」形态渲染，顶部跳过以免重复且明文露答案 */}
      {card.type !== "cloze" ? (
        <div className="text-ink-1 mt-3.5 text-[15.5px] font-bold leading-[1.6]">
          <RichContent content={card.prompt} />
        </div>
      ) : null}
      {renderAnswerBlock()}
      {!detailEmpty ? (
        <div className="text-ink-1 mt-3.5 text-[14px] leading-[1.8]">
          <div className="text-ink-2 mb-1 text-[11.5px] font-extrabold">补充</div>
          <RichContent content={card.detail} />
        </div>
      ) : null}
      {explanation ? (
        <div className="border-line-1 text-ink-2 mt-3.5 border-t border-dashed pt-3 text-[13px] leading-[1.75]">
          <b className="text-ink-1">解析：</b>
          {explanation}
        </div>
      ) : null}
    </>
  );
}

/** 参考资料固定条（页面钉在卡片底部，长内容滚动时始终可见） */
export function ReferenceEntry({ title, onOpen }: { title: string; onOpen: () => void }) {
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
          参考资料 · 点击查看原文
        </span>
      </span>
      <ChevronRight size={16} className="text-ink-3 flex-none" />
    </button>
  );
}
