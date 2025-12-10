import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Flashcard, FlashcardReviewRating } from "@/types";
import type { Descendant } from "slate";
import type { FlashcardBlankElement } from "@tau/editor/src";
import { REVIEW_RATINGS, extractPlainText } from "@/utils/flashcard";
import CustomModal from "@/components/CustomModal";
import CustomCheckbox from "@/components/CustomCheckbox";
import ClozeReviewRenderer from "./components/ClozeReviewRenderer";
import RichTextRenderer from "./components/RichTextRenderer";
import useTheme from "@/hooks/useTheme";
import classNames from "classnames";

interface ReviewModalProps {
  open: boolean;
  reviewQueue: Flashcard[];
  onSubmitReview: (
    cardId: number,
    rating: FlashcardReviewRating
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

// Helper function to extract blanks from richContent
const extractBlanksFromContent = (
  richContent: Descendant[]
): FlashcardBlankElement[] => {
  const blanks: FlashcardBlankElement[] = [];

  const traverse = (node: any) => {
    if (node.type === "flashcard-blank") {
      blanks.push(node);
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };

  richContent.forEach(traverse);
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

  const currentCard = queueSnapshot[currentIndex];
  const totalCards = initialQueueLength;
  const progress = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0;

  useEffect(() => {
    if (open && reviewQueue.length > 0) {
      setCurrentIndex(0);
      setInitialQueueLength(reviewQueue.length);
      setQueueSnapshot([...reviewQueue]);
      setAnswerState({
        submitted: false,
        isCorrect: null,
        userAnswer: {},
      });
    }
  }, [open]);

  useEffect(() => {
    if (currentCard) {
      setAnswerState({
        submitted: false,
        isCorrect: null,
        userAnswer: {},
      });
    }
  }, [currentCard?.id]);

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
            []
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
                    "w-full text-left px-4 py-3 rounded-xl border-2 transition-all",
                    {
                      "border-blue-500 bg-blue-50 dark:bg-blue-500/10":
                        isSelected && !showResult,
                      "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10":
                        showResult && isCorrect,
                      "border-rose-500 bg-rose-50 dark:bg-rose-500/10":
                        showResult && isSelected && !isCorrect,
                      "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600":
                        !isSelected && (!showResult || !isCorrect),
                      "cursor-not-allowed opacity-60": answerState.submitted,
                    }
                  )}
                >
                  <div className="flex items-center gap-3">
                    {!showResult ? (
                      <CustomCheckbox
                        checked={!!isSelected}
                        onChange={() => {}}
                        readonly
                      />
                    ) : (
                      <div
                        className={classNames(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                          {
                            "border-emerald-500 bg-emerald-500": isCorrect,
                            "border-rose-500 bg-rose-500":
                              isSelected && !isCorrect,
                            "border-gray-300 dark:border-gray-600":
                              !isSelected && !isCorrect,
                          }
                        )}
                      >
                        {isCorrect && (
                          <svg
                            className="w-3 h-3 text-white"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2 6l3 3 5-6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        {isSelected && !isCorrect && (
                          <svg
                            className="w-3 h-3 text-white"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M3 3l6 6M9 3L3 9"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        )}
                      </div>
                    )}
                    <span
                      className={classNames("text-sm", {
                        "text-gray-900 dark:text-gray-100":
                          !showResult || isCorrect,
                        "text-gray-500 dark:text-gray-400":
                          showResult && !isSelected && !isCorrect,
                      })}
                    >
                      {option.label}
                    </span>
                  </div>
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
          <div className="space-y-4">
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
                "w-full px-4 py-3 rounded-xl border-2 min-h-[120px] resize-none transition-all",
                "focus:outline-none focus:border-blue-500",
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-100"
                  : "bg-white border-gray-200 text-gray-900",
                { "opacity-60 cursor-not-allowed": answerState.submitted }
              )}
            />
            {answerState.submitted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={classNames(
                  "p-4 rounded-xl border-2",
                  isDark
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-emerald-50 border-emerald-200"
                )}
              >
                <p className="text-sm font-semibold mb-2 text-emerald-600 dark:text-emerald-400">
                  参考答案：
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {data.answer || "未设置参考答案"}
                </p>
              </motion.div>
            )}
          </div>
        );
      }

      case "boolean": {
        return (
          <div className="flex gap-4">
            {[
              { value: true, label: "正确 ✓", color: "emerald" },
              { value: false, label: "错误 ✗", color: "rose" },
            ].map((option) => {
              const isSelected =
                answerState.userAnswer.boolean === option.value;
              const isCorrect = data.booleanAnswer === option.value;
              const showResult = answerState.submitted;

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
                    "flex-1 px-6 py-4 rounded-xl border-2 font-semibold transition-all",
                    {
                      [`border-${option.color}-500 bg-${option.color}-50 dark:bg-${option.color}-500/10 text-${option.color}-600 dark:text-${option.color}-400`]:
                        isSelected && !showResult,
                      "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400":
                        showResult && isCorrect,
                      "border-rose-500 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400":
                        showResult && isSelected && !isCorrect,
                      "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600":
                        !isSelected && (!showResult || !isCorrect),
                      "cursor-not-allowed opacity-60": answerState.submitted,
                    }
                  )}
                >
                  {option.label}
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
      bodyClassName="space-y-6"
    >
      <>
        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              进度：{currentIndex + 1} / {totalCards}
            </span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-linear-to-r from-blue-500 to-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Question */}
        <div>
          {currentCard.type !== "cloze" && (
            <>
              <RichTextRenderer
                key={`prompt-${currentCard.id}`}
                content={currentCard.prompt}
                isDark={isDark}
                className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100"
              />
              {extractPlainText(currentCard.detail).trim() && (
                <RichTextRenderer
                  key={`detail-${currentCard.id}`}
                  content={currentCard.detail}
                  isDark={isDark}
                  className="text-sm text-gray-600 dark:text-gray-400 mt-2"
                />
              )}
            </>
          )}
          {currentCard.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {currentCard.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  {tag}
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={classNames(
                "p-4 rounded-xl border-2 text-center",
                answerState.isCorrect
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/30"
                  : "bg-amber-50 dark:bg-amber-500/10 border-amber-500/30"
              )}
            >
              <p
                className={classNames(
                  "text-lg font-bold mb-2",
                  answerState.isCorrect
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                {currentCard.type === "qa"
                  ? "请对照参考答案，自我评估掌握程度"
                  : answerState.isCorrect
                    ? "回答正确！✓"
                    : "回答错误 ✗"}
              </p>
              {currentCard.data.explanation && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {currentCard.data.explanation}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        {!answerState.submitted ? (
          <button
            onClick={handleSubmitAnswer}
            disabled={!canSubmit}
            className={classNames(
              "w-full py-3 rounded-xl font-semibold transition-all",
              canSubmit
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg"
                : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
            )}
          >
            提交答案
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-center text-gray-600 dark:text-gray-400">
              请根据你的掌握程度选择难度反馈
            </p>
            <div className="grid grid-cols-2 gap-3">
              {REVIEW_RATINGS.map((rating) => (
                <motion.button
                  key={rating.value}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleRate(rating.value)}
                  disabled={isSubmitting}
                  className={classNames(
                    "rounded-xl px-4 py-3 text-left text-sm font-medium text-white shadow-lg",
                    `bg-linear-to-r ${rating.gradient}`,
                    "hover:shadow-xl transition-all",
                    { "opacity-60 cursor-not-allowed": isSubmitting }
                  )}
                >
                  <div className="font-bold">{rating.label}</div>
                  <p className="text-xs opacity-90 mt-1">
                    {rating.description}
                  </p>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </>
    </CustomModal>
  );
};

export default ReviewModal;
