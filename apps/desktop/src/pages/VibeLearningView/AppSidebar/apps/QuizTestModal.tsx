import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Clock,
  Target,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useVLQuizStore from "@/stores/useVLQuizStore";
import useTheme from "@/hooks/useTheme";
import type {
  VLQuizSet,
  VLQuizItem,
  QuizAnswerRecord,
  VLQuizRecord,
} from "@/types";
import type { FlashcardBlankElement } from "@/editor-extensions/flashcard-blank/types";
import RichTextRenderer from "@/pages/FlashcardCenter/components/RichTextRenderer";
import ClozeReviewRenderer from "@/pages/FlashcardCenter/components/ClozeReviewRenderer";

interface QuizTestModalProps {
  open: boolean;
  quizSet: VLQuizSet | null;
  onClose: () => void;
}

type ModalStep = "testing" | "result";

// 从富文本中提取填空元素
const extractBlanksFromContent = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  richContent: any[],
): FlashcardBlankElement[] => {
  const blanks: FlashcardBlankElement[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traverse = (node: any) => {
    if (node.type === "flashcard-blank") {
      blanks.push(node as FlashcardBlankElement);
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };

  richContent.forEach((node) => traverse(node));
  return blanks;
};

const QuizTestModal = memo((props: QuizTestModalProps) => {
  const { open, quizSet, onClose } = props;
  const { isDark } = useTheme();

  // Store
  const {
    testSession,
    submitAnswer,
    nextQuestion,
    prevQuestion,
    finishTest,
    cancelTest,
    getTestProgress,
  } = useVLQuizStore();

  // Local state
  const [step, setStep] = useState<ModalStep>("testing");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentAnswer, setCurrentAnswer] = useState<any>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizRecord, setQuizRecord] = useState<VLQuizRecord | null>(null);

  // 当前题目
  const currentItem = useMemo(() => {
    if (!testSession) return null;
    return testSession.items[testSession.currentIndex];
  }, [testSession]);

  // 进度信息
  const progress = getTestProgress();
  const progressPercent =
    progress && progress.total > 0
      ? (progress.current / progress.total) * 100
      : 0;

  // 重置答案状态
  useEffect(() => {
    if (currentItem && testSession) {
      const existing = testSession.answers[currentItem.id];
      if (existing) {
        setCurrentAnswer(existing.userAnswer);
        setShowAnswer(true);
      } else {
        setCurrentAnswer(null);
        setShowAnswer(false);
      }
    }
  }, [currentItem, testSession]);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      setStep("testing");
      setQuizRecord(null);
    }
  }, [open]);

  // 检查答案是否正确
  const checkAnswer = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: VLQuizItem, answer: any): { isCorrect: boolean; score: number } => {
      const data = item.data;

      switch (item.type) {
        case "single-choice": {
          const correctOption = data.options?.find((opt) => opt.isCorrect);
          const isCorrect = answer === correctOption?.id;
          return { isCorrect, score: isCorrect ? 1 : 0 };
        }
        case "multiple-choice": {
          const correctIds = new Set(
            data.options?.filter((opt) => opt.isCorrect).map((opt) => opt.id) ??
              [],
          );
          const userIds = new Set(answer ?? []);
          const isCorrect =
            correctIds.size === userIds.size &&
            [...correctIds].every((id) => userIds.has(id));
          return { isCorrect, score: isCorrect ? 1 : 0 };
        }
        case "cloze": {
          const blanks = extractBlanksFromContent(item.prompt);
          let correctCount = 0;
          blanks.forEach((blank) => {
            const userAnswer = answer?.[blank.blankId]?.trim().toLowerCase();
            const correctAnswer = blank.answer.trim().toLowerCase();
            const alternatives =
              blank.alternativeAnswers?.map((a) => a.trim().toLowerCase()) ??
              [];
            if (
              userAnswer === correctAnswer ||
              alternatives.includes(userAnswer ?? "")
            ) {
              correctCount++;
            }
          });
          const isCorrect = correctCount === blanks.length;
          const score = blanks.length > 0 ? correctCount / blanks.length : 0;
          return { isCorrect, score };
        }
        case "qa": {
          return { isCorrect: true, score: 1 };
        }
        case "boolean": {
          const isCorrect = answer === data.booleanAnswer;
          return { isCorrect, score: isCorrect ? 1 : 0 };
        }
        default:
          return { isCorrect: false, score: 0 };
      }
    },
    [],
  );

  // 提交当前答案
  const handleSubmitAnswer = useMemoizedFn(() => {
    if (!currentItem || currentAnswer === null || currentAnswer === undefined)
      return;

    const { isCorrect, score } = checkAnswer(currentItem, currentAnswer);
    const startTime = testSession?.startTime ?? Date.now();
    const duration = Math.round((Date.now() - startTime) / 1000);

    const record: QuizAnswerRecord = {
      itemId: currentItem.id,
      userAnswer: currentAnswer,
      isCorrect,
      score,
      duration,
    };

    submitAnswer(currentItem.id, record);
    setShowAnswer(true);
  });

  // 下一题
  const handleNext = useMemoizedFn(() => {
    if (!progress) return;
    if (progress.current < progress.total) {
      nextQuestion();
    }
  });

  // 上一题
  const handlePrev = useMemoizedFn(() => {
    if (!progress) return;
    if (progress.current > 1) {
      prevQuestion();
    }
  });

  // 完成测验
  const handleFinish = useMemoizedFn(async () => {
    const record = await finishTest();
    setQuizRecord(record);
    setStep("result");
  });

  // 关闭弹窗
  const handleClose = useMemoizedFn(() => {
    cancelTest();
    onClose();
  });

  // 判断是否可以提交答案
  const canSubmitAnswer = useMemo(() => {
    if (showAnswer) return false;
    if (currentAnswer === null || currentAnswer === undefined) return false;
    if (
      currentItem?.type === "multiple-choice" &&
      Array.isArray(currentAnswer) &&
      currentAnswer.length === 0
    )
      return false;
    if (currentItem?.type === "qa" && !currentAnswer?.trim()) return false;
    return true;
  }, [showAnswer, currentAnswer, currentItem]);

  // 判断是否是最后一题
  const isLastQuestion = progress ? progress.current === progress.total : false;

  // 获取当前答案是否正确
  const currentAnswerCorrect = useMemo(() => {
    if (!showAnswer || !currentItem) return null;
    const existing = testSession?.answers[currentItem.id];
    return existing?.isCorrect ?? null;
  }, [showAnswer, currentItem, testSession]);

  // 题型显示名称
  const typeLabels: Record<string, string> = {
    "single-choice": "单选题",
    "multiple-choice": "多选题",
    cloze: "填空题",
    qa: "问答题",
    boolean: "判断题",
  };

  // 渲染选择题选项
  const renderChoiceOptions = () => {
    if (!currentItem) return null;
    const data = currentItem.data;
    const isMultiple = currentItem.type === "multiple-choice";

    return (
      <div className="space-y-3">
        {(data.options ?? []).map((option) => {
          const isSelected = isMultiple
            ? (currentAnswer ?? []).includes(option.id)
            : currentAnswer === option.id;
          const isCorrect = option.isCorrect;
          const showResult = showAnswer;

          let cardStyle =
            "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-zinc-800/50";
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
              disabled={showAnswer}
              onClick={() => {
                if (isMultiple) {
                  const current = currentAnswer ?? [];
                  setCurrentAnswer(
                    current.includes(option.id)
                      ? current.filter((id: string) => id !== option.id)
                      : [...current, option.id],
                  );
                } else {
                  setCurrentAnswer(option.id);
                }
              }}
              className={classNames(
                "group w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3",
                cardStyle,
                { "cursor-default": showAnswer },
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
  };

  // 渲染判断题
  const renderBooleanOptions = () => {
    if (!currentItem) return null;
    const data = currentItem.data;

    return (
      <div className="grid grid-cols-2 gap-4">
        {[
          { value: true, label: "正确", icon: CheckCircle2 },
          { value: false, label: "错误", icon: XCircle },
        ].map((option) => {
          const isSelected = currentAnswer === option.value;
          const isCorrect = data.booleanAnswer === option.value;
          const showResult = showAnswer;
          const Icon = option.icon;

          let btnClass =
            "border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800 hover:border-gray-300 dark:hover:border-gray-600";
          let textClass = "text-gray-600 dark:text-gray-400";
          let iconClass = "text-gray-400 dark:text-gray-500";

          if (!showResult) {
            if (isSelected) {
              btnClass =
                option.value === true
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm"
                  : "border-rose-500 bg-rose-50 dark:bg-rose-500/10 shadow-sm";
              textClass =
                option.value === true
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400";
              iconClass =
                option.value === true ? "text-emerald-500" : "text-rose-500";
            } else {
              btnClass += " hover:bg-gray-50 dark:hover:bg-zinc-700/50";
            }
          } else {
            if (isCorrect) {
              btnClass =
                "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-500/20";
              textClass = "text-emerald-600 dark:text-emerald-400";
              iconClass = "text-emerald-500";
            } else if (isSelected && !isCorrect) {
              btnClass = "border-rose-500 bg-rose-50 dark:bg-rose-500/10";
              textClass = "text-rose-600 dark:text-rose-400";
              iconClass = "text-rose-500";
            } else {
              btnClass = "border-gray-100 dark:border-gray-800 opacity-50";
            }
          }

          return (
            <button
              key={String(option.value)}
              disabled={showAnswer}
              onClick={() => setCurrentAnswer(option.value)}
              className={classNames(
                "flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 font-bold transition-all duration-200",
                btnClass,
                textClass,
                { "cursor-default": showAnswer },
              )}
            >
              <Icon className={classNames("w-8 h-8 mb-1", iconClass)} />
              <span className="text-lg">{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // 渲染问答题
  const renderQAInput = () => {
    if (!currentItem) return null;
    const data = currentItem.data;

    return (
      <div className="space-y-6">
        <textarea
          disabled={showAnswer}
          value={currentAnswer ?? ""}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          placeholder="请输入你的答案..."
          className={classNames(
            "w-full px-5 py-4 rounded-xl border-2 min-h-[160px] resize-none transition-all text-base leading-relaxed",
            "focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10",
            isDark
              ? "bg-zinc-800 border-gray-700 text-gray-100 placeholder-gray-500"
              : "bg-white border-gray-200 text-gray-900 placeholder-gray-400",
            { "opacity-60 cursor-not-allowed": showAnswer },
          )}
        />
        {showAnswer && data.answer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={classNames(
              "p-5 rounded-xl border-l-4 shadow-sm",
              isDark
                ? "bg-zinc-800 border-emerald-500/50"
                : "bg-white border-emerald-500 shadow-gray-100",
            )}
          >
            <p className="text-sm font-bold mb-2 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> 参考答案
            </p>
            <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
              <p className="whitespace-pre-wrap">{data.answer}</p>
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  // 渲染题目内容
  const renderQuestionContent = () => {
    if (!currentItem) return null;

    switch (currentItem.type) {
      case "single-choice":
      case "multiple-choice":
        return renderChoiceOptions();
      case "boolean":
        return renderBooleanOptions();
      case "qa":
        return renderQAInput();
      case "cloze":
        return null; // 填空题内容已在题干中渲染
      default:
        return <p className="text-gray-500">未知题型</p>;
    }
  };

  // 渲染测验结果
  const renderResult = () => {
    if (!quizRecord) return null;

    const scoreLevel =
      quizRecord.score >= 90
        ? "excellent"
        : quizRecord.score >= 70
          ? "good"
          : quizRecord.score >= 60
            ? "pass"
            : "fail";

    const levelConfig = {
      excellent: {
        gradient: "from-emerald-500 to-teal-500",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        text: "text-emerald-600 dark:text-emerald-400",
        label: "太棒了！",
        emoji: "🎉",
      },
      good: {
        gradient: "from-blue-500 to-cyan-500",
        bg: "bg-blue-50 dark:bg-blue-900/20",
        text: "text-blue-600 dark:text-blue-400",
        label: "做得不错！",
        emoji: "👍",
      },
      pass: {
        gradient: "from-amber-500 to-orange-500",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        text: "text-amber-600 dark:text-amber-400",
        label: "继续加油！",
        emoji: "💪",
      },
      fail: {
        gradient: "from-rose-500 to-pink-500",
        bg: "bg-rose-50 dark:bg-rose-900/20",
        text: "text-rose-600 dark:text-rose-400",
        label: "再接再厉！",
        emoji: "📚",
      },
    };

    const config = levelConfig[scoreLevel];

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center py-8"
      >
        {/* 成绩圆环 */}
        <div className="relative mb-6">
          <div
            className={classNames(
              "w-40 h-40 rounded-full flex items-center justify-center",
              config.bg,
            )}
          >
            <div className="text-center">
              <div
                className={classNames(
                  "text-5xl font-bold bg-linear-to-r bg-clip-text text-transparent",
                  config.gradient,
                )}
              >
                {quizRecord.score.toFixed(0)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                分
              </div>
            </div>
          </div>
          <div className="absolute -top-2 -right-2 text-4xl">
            {config.emoji}
          </div>
        </div>

        {/* 评语 */}
        <h3 className={classNames("text-2xl font-bold mb-6", config.text)}>
          {config.label}
        </h3>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-md mb-8">
          <div
            className={classNames(
              "flex flex-col items-center p-4 rounded-xl",
              isDark ? "bg-zinc-800" : "bg-gray-50",
            )}
          >
            <Target className="w-5 h-5 text-blue-500 mb-2" />
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {quizRecord.correctCount}/{quizRecord.totalCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              正确率
            </div>
          </div>
          <div
            className={classNames(
              "flex flex-col items-center p-4 rounded-xl",
              isDark ? "bg-zinc-800" : "bg-gray-50",
            )}
          >
            <Clock className="w-5 h-5 text-amber-500 mb-2" />
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {Math.floor(quizRecord.duration / 60)}:
              {String(quizRecord.duration % 60).padStart(2, "0")}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">用时</div>
          </div>
          <div
            className={classNames(
              "flex flex-col items-center p-4 rounded-xl",
              isDark ? "bg-zinc-800" : "bg-gray-50",
            )}
          >
            <Trophy className="w-5 h-5 text-emerald-500 mb-2" />
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {quizRecord.totalCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              总题数
            </div>
          </div>
        </div>

        {/* 完成按钮 */}
        <button
          onClick={handleClose}
          className={classNames(
            "px-8 py-3 rounded-xl font-bold text-white transition-all duration-200",
            "bg-linear-to-r hover:opacity-90",
            config.gradient,
          )}
        >
          完成测验
        </button>
      </motion.div>
    );
  };

  if (!currentItem || !progress) {
    return null;
  }

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width="720px"
      centered
      footer={null}
      showCloseButton={!showAnswer}
      bodyClassName="p-0"
    >
      <div className="flex flex-col">
        {step === "testing" && (
          <>
            {/* Header & Progress */}
            <div className="pt-6 px-8 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {quizSet && <span className="text-xl">{quizSet.emoji}</span>}
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                      {progress.current} / {progress.total}
                    </span>
                    <span className="text-sm font-medium text-gray-400 dark:text-gray-500">
                      {typeLabels[currentItem.type] || currentItem.type}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-bold text-blue-500">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Content Area */}
            <div className="px-8 py-6 space-y-8 min-h-[400px]">
              {/* Question */}
              <div>
                {currentItem.type === "cloze" ? (
                  <ClozeReviewRenderer
                    key={`cloze-${currentItem.id}`}
                    richContent={currentItem.prompt}
                    revealed={showAnswer}
                    isDark={isDark}
                    interactive={!showAnswer}
                    onBlankChange={(blankId, value) => {
                      setCurrentAnswer((prev: Record<string, string>) => ({
                        ...prev,
                        [blankId]: value,
                      }));
                    }}
                  />
                ) : (
                  <RichTextRenderer
                    key={`prompt-${currentItem.id}`}
                    content={currentItem.prompt}
                    isDark={isDark}
                    className="text-xl md:text-2xl font-medium leading-normal text-gray-900 dark:text-gray-50"
                  />
                )}

                {currentItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {currentItem.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
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
                {showAnswer && currentAnswerCorrect !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 10, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className={classNames(
                        "p-5 rounded-xl border-l-4 shadow-sm",
                        currentAnswerCorrect || currentItem.type === "qa"
                          ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500 shadow-emerald-500/5"
                          : "bg-amber-50 dark:bg-amber-900/10 border-amber-500 shadow-amber-500/5",
                      )}
                    >
                      <p
                        className={classNames(
                          "text-lg font-bold mb-2 flex items-center gap-2",
                          currentAnswerCorrect || currentItem.type === "qa"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {currentItem.type === "qa" ? (
                          "自我评估"
                        ) : currentAnswerCorrect ? (
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
                      {currentItem.data.explanation ? (
                        <div className="mt-3 text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                          <span className="font-semibold opacity-75 block mb-1 text-sm">
                            解析：
                          </span>
                          {currentItem.data.explanation}
                        </div>
                      ) : (
                        !currentAnswerCorrect &&
                        currentItem.type !== "qa" && (
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
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center">
                {/* 上一题按钮 */}
                <div className="flex-1">
                  <button
                    onClick={handlePrev}
                    disabled={progress.current <= 1}
                    className={classNames(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all",
                      progress.current <= 1
                        ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800",
                    )}
                  >
                    <ChevronLeft className="w-5 h-5" />
                    上一题
                  </button>
                </div>

                {/* 主按钮 - 居中 */}
                <div className="shrink-0">
                  {!showAnswer ? (
                    <button
                      onClick={handleSubmitAnswer}
                      disabled={!canSubmitAnswer}
                      className={classNames(
                        "px-8 py-3 rounded-xl font-bold text-lg transition-all duration-200",
                        canSubmitAnswer
                          ? "bg-blue-600 hover:bg-blue-500 text-white"
                          : "bg-gray-200 dark:bg-zinc-800 text-gray-400 cursor-not-allowed",
                      )}
                    >
                      提交答案
                    </button>
                  ) : isLastQuestion ? (
                    <button
                      onClick={handleFinish}
                      className="px-8 py-3 rounded-xl font-bold text-lg bg-linear-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 transition-all duration-200"
                    >
                      完成测验
                    </button>
                  ) : null}
                </div>

                {/* 下一题按钮 */}
                <div className="flex-1 flex justify-end">
                  {showAnswer && !isLastQuestion && (
                    <button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-lg bg-blue-600 hover:bg-blue-500 text-white transition-all duration-200"
                    >
                      下一题
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {step === "result" && renderResult()}
      </div>
    </CustomModal>
  );
});

QuizTestModal.displayName = "QuizTestModal";

export default QuizTestModal;
