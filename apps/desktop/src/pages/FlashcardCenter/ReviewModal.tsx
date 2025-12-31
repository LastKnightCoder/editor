import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Flashcard, FlashcardReviewRating } from "@/types";
import type { Descendant } from "slate";
import type { FlashcardBlankElement } from "@tau/editor/src";
import { REVIEW_RATINGS, extractPlainText } from "@/utils/flashcard/index";
import CustomModal from "@/components/CustomModal";
import ClozeReviewRenderer from "./components/ClozeReviewRenderer";
import RichTextRenderer from "./components/RichTextRenderer";
import useTheme from "@/hooks/useTheme";
import classNames from "classnames";
import useAnswerJudgement from "@/hooks/useAnswerJudgement";
import AIJudgementResultView, {
  AIJudgementLoading,
  AIJudgementError,
} from "./components/AIJudgementResult";
import {
  CheckCircle2,
  XCircle,
  Circle,
  HelpCircle,
  Check,
  X,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";

interface ReviewModalProps {
  open: boolean;
  reviewQueue: Flashcard[];
  onSubmitReview: (
    cardId: number,
    rating: FlashcardReviewRating,
  ) => Promise<void>;
  onClose: () => void;
}

interface AnswerState {
  submitted: boolean;
  isCorrect: boolean | null;
  userAnswer: {
    singleChoice?: string;
    multipleChoice?: string[];
    cloze?: Record<string, string>;
    qa?: string;
    boolean?: boolean;
  };
}

interface SlateNode {
  type?: string;
  children?: SlateNode[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Helper function to extract blanks from richContent
const extractBlanksFromContent = (
  richContent: Descendant[],
): FlashcardBlankElement[] => {
  const blanks: FlashcardBlankElement[] = [];

  const traverse = (node: SlateNode) => {
    if (node.type === "flashcard-blank") {
      blanks.push(node as unknown as FlashcardBlankElement);
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };

  richContent.forEach((node) => traverse(node as SlateNode));
  return blanks;
};

const ReviewModal: React.FC<ReviewModalProps> = ({
  open,
  reviewQueue,
  onSubmitReview,
  onClose,
}) => {
  const { isDark } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>({
    submitted: false,
    isCorrect: null,
    userAnswer: {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 记录初始队列长度，避免复习过程中队列长度变化导致进度显示错误
  const [initialQueueLength, setInitialQueueLength] = useState(0);
  // 保存初始队列快照，因为 reviewQueue 会在复习过程中被修改
  const [queueSnapshot, setQueueSnapshot] = useState<Flashcard[]>([]);

  // AI 评判
  const {
    status: judgementStatus,
    result: judgementResult,
    error: judgementError,
    isConfigured: isJudgementConfigured,
    judge,
    reset: resetJudgement,
  } = useAnswerJudgement();

  const currentCard = queueSnapshot[currentIndex];
  const totalCards = initialQueueLength;
  const progress = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0;

  const handleOpen = useMemoizedFn((open: boolean) => {
    if (!open || reviewQueue.length === 0) return;
    setCurrentIndex(0);
    setInitialQueueLength(reviewQueue.length);
    setQueueSnapshot([...reviewQueue]);
    setAnswerState({
      submitted: false,
      isCorrect: null,
      userAnswer: {},
    });
  });

  useEffect(() => {
    handleOpen(open);
  }, [open, handleOpen]);

  useEffect(() => {
    if (currentCard) {
      setAnswerState({
        submitted: false,
        isCorrect: null,
        userAnswer: {},
      });
      resetJudgement();
    }
  }, [currentCard, resetJudgement]);

  const checkAnswer = (): boolean => {
    if (!currentCard) return false;
    const data = currentCard.data;

    switch (currentCard.type) {
      case "single-choice": {
        const correctOption = data.options?.find((opt) => opt.isCorrect);
        return answerState.userAnswer.singleChoice === correctOption?.id;
      }
      case "multiple-choice": {
        const correctIds = new Set(
          data.options?.filter((opt) => opt.isCorrect).map((opt) => opt.id) ??
            [],
        );
        const userIds = new Set(answerState.userAnswer.multipleChoice ?? []);
        return (
          correctIds.size === userIds.size &&
          [...correctIds].every((id) => userIds.has(id))
        );
      }
      case "cloze": {
        const blanks = extractBlanksFromContent(currentCard.prompt);
        return blanks.every((blank) => {
          const userAnswer = answerState.userAnswer.cloze?.[blank.blankId]
            ?.trim()
            .toLowerCase();
          const correctAnswer = blank.answer.trim().toLowerCase();
          const alternatives =
            blank.alternativeAnswers?.map((a) => a.trim().toLowerCase()) ?? [];
          return (
            userAnswer === correctAnswer ||
            alternatives.includes(userAnswer ?? "")
          );
        });
      }
      case "qa": {
        return true; // QA type always returns true, user judges themselves
      }
      case "boolean": {
        return answerState.userAnswer.boolean === data.booleanAnswer;
      }
      default:
        return false;
    }
  };

  const handleSubmitAnswer = () => {
    const isCorrect = checkAnswer();
    setAnswerState((prev) => ({
      ...prev,
      submitted: true,
      isCorrect,
    }));

    // 对 QA 类型触发 AI 评判（如果已配置）
    if (
      currentCard?.type === "qa" &&
      isJudgementConfigured &&
      answerState.userAnswer.qa
    ) {
      judge(answerState.userAnswer.qa, currentCard);
    }
  };

  const handleRate = async (rating: FlashcardReviewRating) => {
    if (!currentCard || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmitReview(currentCard.id, rating);

      if (currentIndex < totalCards - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Submit review failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = useMemo(() => {
    if (!currentCard || answerState.submitted) return false;

    switch (currentCard.type) {
      case "single-choice":
        return !!answerState.userAnswer.singleChoice;
      case "multiple-choice":
        return (answerState.userAnswer.multipleChoice?.length ?? 0) > 0;
      case "cloze":
        return Object.keys(answerState.userAnswer.cloze ?? {}).length > 0;
      case "qa":
        return !!answerState.userAnswer.qa?.trim();
      case "boolean":
        return answerState.userAnswer.boolean !== undefined;
      default:
        return false;
    }
  }, [currentCard, answerState]);

  const renderQuestionContent = () => {
    if (!currentCard) return null;
    const data = currentCard.data;

    switch (currentCard.type) {
      case "single-choice":
      case "multiple-choice": {
        const isMultiple = currentCard.type === "multiple-choice";
        return (
          <div className="space-y-3">
            {(data.options ?? []).map((option) => {
              const isSelected = isMultiple
                ? answerState.userAnswer.multipleChoice?.includes(option.id)
                : answerState.userAnswer.singleChoice === option.id;
              const isCorrect = option.isCorrect;
              const showResult = answerState.submitted;

              let cardStyle =
                "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/50";
              let iconColor =
                "text-gray-300 dark:text-gray-600 group-hover:text-blue-400";

              if (!showResult) {
                if (isSelected) {
                  cardStyle =
                    "border-blue-500 bg-blue-50 dark:bg-blue-500/10 shadow-sm shadow-blue-500/10";
                  iconColor = "text-blue-500";
                }
              } else {
                if (isCorrect) {
                  cardStyle =
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-500/20";
                  iconColor = "text-emerald-500";
                } else if (isSelected && !isCorrect) {
                  cardStyle = "border-rose-500 bg-rose-50 dark:bg-rose-500/10";
                  iconColor = "text-rose-500";
                } else {
                  cardStyle = "border-gray-100 dark:border-gray-800 opacity-60";
                  iconColor = "text-gray-300 dark:text-gray-600";
                }
              }

              return (
                <button
                  key={option.id}
                  disabled={answerState.submitted}
                  onClick={() => {
                    if (isMultiple) {
                      const current =
                        answerState.userAnswer.multipleChoice ?? [];
                      setAnswerState((prev) => ({
                        ...prev,
                        userAnswer: {
                          ...prev.userAnswer,
                          multipleChoice: current.includes(option.id)
                            ? current.filter((id) => id !== option.id)
                            : [...current, option.id],
                        },
                      }));
                    } else {
                      setAnswerState((prev) => ({
                        ...prev,
                        userAnswer: {
                          ...prev.userAnswer,
                          singleChoice: option.id,
                        },
                      }));
                    }
                  }}
                  className={classNames(
                    "group w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3",
                    cardStyle,
                    { "cursor-default": answerState.submitted },
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {showResult ? (
                      isCorrect || (isSelected && !isCorrect) ? (
                        isCorrect ? (
                          <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
                        ) : (
                          <XCircle className={`w-5 h-5 ${iconColor}`} />
                        )
                      ) : (
                        <Circle className={`w-5 h-5 ${iconColor}`} />
                      )
                    ) : isSelected ? (
                      <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
                    ) : (
                      <Circle className={`w-5 h-5 ${iconColor}`} />
                    )}
                  </div>
                  <span
                    className={classNames(
                      "text-base leading-relaxed transition-colors",
                      {
                        "text-gray-900 dark:text-gray-100 font-medium":
                          !showResult || isCorrect,
                        "text-gray-500 dark:text-gray-400":
                          showResult && !isSelected && !isCorrect,
                        "text-rose-600 dark:text-rose-400":
                          showResult && isSelected && !isCorrect,
                      },
                    )}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        );
      }

      case "cloze": {
        return (
          <ClozeReviewRenderer
            key={`cloze-${currentCard.id}`}
            richContent={currentCard.prompt}
            revealed={answerState.submitted}
            isDark={isDark}
            interactive={!answerState.submitted}
            onBlankChange={(blankId, value) => {
              setAnswerState((prev) => ({
                ...prev,
                userAnswer: {
                  ...prev.userAnswer,
                  cloze: { ...(prev.userAnswer.cloze ?? {}), [blankId]: value },
                },
              }));
            }}
          />
        );
      }

      case "qa": {
        return (
          <div className="space-y-6">
            <textarea
              disabled={answerState.submitted}
              value={answerState.userAnswer.qa ?? ""}
              onChange={(e) => {
                setAnswerState((prev) => ({
                  ...prev,
                  userAnswer: { ...prev.userAnswer, qa: e.target.value },
                }));
              }}
              placeholder="请输入你的答案..."
              className={classNames(
                "w-full px-5 py-4 rounded-xl border-2 min-h-[160px] resize-none transition-all text-base leading-relaxed",
                "focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10",
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500"
                  : "bg-white border-gray-200 text-gray-900 placeholder-gray-400",
                { "opacity-60 cursor-not-allowed": answerState.submitted },
              )}
            />
            {answerState.submitted && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* AI 评判结果 */}
                {judgementStatus === "loading" && <AIJudgementLoading />}
                {judgementStatus === "error" && (
                  <AIJudgementError
                    message={judgementError?.message || "评判失败"}
                    onRetry={() => {
                      if (answerState.userAnswer.qa && currentCard) {
                        judge(answerState.userAnswer.qa, currentCard);
                      }
                    }}
                  />
                )}
                {judgementStatus === "success" && judgementResult && (
                  <AIJudgementResultView
                    result={judgementResult}
                    isDark={isDark}
                  />
                )}

                {/* 参考答案 */}
                <div
                  className={classNames(
                    "p-5 rounded-xl border-l-4 shadow-sm",
                    isDark
                      ? "bg-gray-800 border-emerald-500/50"
                      : "bg-white border-emerald-500 shadow-gray-100",
                  )}
                >
                  <p className="text-sm font-bold mb-2 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> 参考答案
                  </p>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p className="whitespace-pre-wrap">
                      {data.answer || "未设置参考答案"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }

      case "boolean": {
        return (
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                value: true,
                label: "正确",
                color: "emerald",
                icon: CheckCircle2,
              },
              { value: false, label: "错误", color: "rose", icon: XCircle },
            ].map((option) => {
              const isSelected =
                answerState.userAnswer.boolean === option.value;
              const isCorrect = data.booleanAnswer === option.value;
              const showResult = answerState.submitted;
              const Icon = option.icon;

              let btnClass =
                "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600";
              let textClass = "text-gray-600 dark:text-gray-400";

              if (!showResult) {
                if (isSelected) {
                  btnClass = `border-${option.color}-500 bg-${option.color}-50 dark:bg-${option.color}-500/10 shadow-sm`;
                  textClass = `text-${option.color}-600 dark:text-${option.color}-400`;
                } else {
                  btnClass += " hover:bg-gray-50 dark:hover:bg-gray-700/50";
                }
              } else {
                if (isCorrect) {
                  btnClass =
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-500/20";
                  textClass = "text-emerald-600 dark:text-emerald-400";
                } else if (isSelected && !isCorrect) {
                  btnClass = "border-rose-500 bg-rose-50 dark:bg-rose-500/10";
                  textClass = "text-rose-600 dark:text-rose-400";
                } else {
                  btnClass = "border-gray-100 dark:border-gray-800 opacity-50";
                }
              }

              return (
                <button
                  key={String(option.value)}
                  disabled={answerState.submitted}
                  onClick={() => {
                    setAnswerState((prev) => ({
                      ...prev,
                      userAnswer: { ...prev.userAnswer, boolean: option.value },
                    }));
                  }}
                  className={classNames(
                    "flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 font-bold transition-all duration-200",
                    btnClass,
                    textClass,
                    { "cursor-default": answerState.submitted },
                  )}
                >
                  <Icon className="w-8 h-8 mb-1" />
                  <span className="text-lg">{option.label}</span>
                </button>
              );
            })}
          </div>
        );
      }

      default:
        return <p className="text-gray-500">未知题型</p>;
    }
  };

  if (!currentCard || totalCards === 0) {
    return null;
  }

  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      width="800px"
      centered
      footer={null}
      showCloseButton={!answerState.submitted}
      bodyClassName="p-0" // Reset padding to handle it internally
    >
      <div className="flex flex-col">
        {/* Header & Progress */}
        <div className="pt-6 px-8 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {currentIndex + 1} / {totalCards}
              </span>
              <span className="text-sm font-medium text-gray-400 dark:text-gray-500">
                {currentCard.type === "single-choice" && "单选题"}
                {currentCard.type === "multiple-choice" && "多选题"}
                {currentCard.type === "cloze" && "填空题"}
                {currentCard.type === "boolean" && "判断题"}
                {currentCard.type === "qa" && "问答题"}
              </span>
            </div>
            <span className="text-sm font-bold text-blue-500">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="px-8 py-6 space-y-8">
          {/* Question */}
          <div>
            {currentCard.type !== "cloze" && (
              <>
                <RichTextRenderer
                  key={`prompt-${currentCard.id}`}
                  content={currentCard.prompt}
                  isDark={isDark}
                  className="text-xl md:text-2xl font-medium leading-normal text-gray-900 dark:text-gray-50"
                />
                {extractPlainText(currentCard.detail).trim() && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                    <RichTextRenderer
                      key={`detail-${currentCard.id}`}
                      content={currentCard.detail}
                      isDark={isDark}
                      className="text-base text-gray-600 dark:text-gray-400"
                    />
                  </div>
                )}
              </>
            )}
            {currentCard.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {currentCard.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Answer Area */}
          <div>{renderQuestionContent()}</div>

          {/* Result Display */}
          <AnimatePresence>
            {answerState.submitted && answerState.isCorrect !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 10, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className={classNames(
                    "p-5 rounded-xl border-l-4 shadow-sm",
                    answerState.isCorrect
                      ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500 shadow-emerald-500/5"
                      : "bg-amber-50 dark:bg-amber-900/10 border-amber-500 shadow-amber-500/5",
                  )}
                >
                  <p
                    className={classNames(
                      "text-lg font-bold mb-2 flex items-center gap-2",
                      answerState.isCorrect
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {currentCard.type === "qa" ? (
                      <>
                        <HelpCircle className="w-5 h-5" />
                        自我评估
                      </>
                    ) : answerState.isCorrect ? (
                      <>
                        <Check className="w-5 h-5" />
                        回答正确！
                      </>
                    ) : (
                      <>
                        <X className="w-5 h-5" />
                        回答错误
                      </>
                    )}
                  </p>
                  {currentCard.data.explanation ? (
                    <div className="mt-3 text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                      <span className="font-semibold opacity-75 block mb-1 text-sm">
                        解析：
                      </span>
                      {currentCard.data.explanation}
                    </div>
                  ) : (
                    !answerState.isCorrect && (
                      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                        暂无解析，请参考正确答案。
                      </p>
                    )
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          {!answerState.submitted ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={!canSubmit}
              className={classNames(
                "w-full py-3.5 rounded-xl font-bold text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0",
                canSubmit
                  ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed shadow-none",
              )}
            >
              提交答案
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0">
                  反馈难度以调整复习间隔
                </p>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {REVIEW_RATINGS.map((rating) => (
                  <motion.button
                    key={rating.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleRate(rating.value)}
                    disabled={isSubmitting}
                    className={classNames(
                      "rounded-xl p-3 text-center border-2 transition-colors relative overflow-hidden group",
                      rating.bgColor,
                      rating.textColor,
                      rating.borderColor,
                      rating.hoverBgColor,
                      { "opacity-60 cursor-not-allowed": isSubmitting },
                    )}
                  >
                    <div className="font-bold text-base mb-0.5">
                      {rating.label}
                    </div>
                    <p className="text-xs opacity-80 font-medium truncate px-1">
                      {rating.description}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </CustomModal>
  );
};

export default ReviewModal;
