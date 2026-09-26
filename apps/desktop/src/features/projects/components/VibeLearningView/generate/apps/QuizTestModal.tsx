import { memo, useState, useEffect, useMemo, useCallback } from "react";
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
import { Button, Dialog, Textarea, cn } from "@tau/ui";

import useVLQuizStore from "@/stores/useVLQuizStore";
import useTheme from "@/hooks/useTheme";
import type { VLQuizSet, VLQuizItem, QuizAnswerRecord, VLQuizRecord } from "@/types";
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
  richContent: any[]
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

  richContent.forEach(node => traverse(node));
  return blanks;
};

// 题型显示名称
const TYPE_LABELS: Record<string, string> = {
  "single-choice": "单选题",
  "multiple-choice": "多选题",
  cloze: "填空题",
  qa: "问答题",
  boolean: "判断题",
};

// 成绩档位：只用语义色表意
const LEVEL_CONFIG = {
  excellent: { text: "text-accent-text", ring: "border-accent", label: "太棒了" },
  good: { text: "text-info", ring: "border-info", label: "做得不错" },
  pass: { text: "text-warn", ring: "border-warn", label: "继续加油" },
  fail: { text: "text-danger", ring: "border-danger", label: "再接再厉" },
} as const;

/** 答题选项卡片的状态样式：作答中 accent 选中；揭晓后正确 ok、选错 danger、其余淡出 */
function optionTone(showResult: boolean, isSelected: boolean, isCorrect: boolean) {
  if (!showResult) {
    return isSelected
      ? { card: "border-accent bg-accent-soft", icon: "text-accent-text", text: "text-ink-1" }
      : { card: "border-line-1 hover:bg-hover", icon: "text-ink-3", text: "text-ink-1" };
  }
  if (isCorrect) return { card: "border-ok bg-ok-soft", icon: "text-ok", text: "text-ink-1" };
  if (isSelected) {
    return { card: "border-danger bg-danger-soft", icon: "text-danger", text: "text-danger" };
  }
  return { card: "border-line-1 opacity-60", icon: "text-ink-3", text: "text-ink-2" };
}

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
  const [finishing, setFinishing] = useState(false);

  // 当前题目
  const currentItem = useMemo(() => {
    if (!testSession) return null;
    return testSession.items[testSession.currentIndex];
  }, [testSession]);

  // 进度信息
  const progress = getTestProgress();
  const progressPercent =
    progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

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
      setFinishing(false);
    }
  }, [open]);

  // 检查答案是否正确
  const checkAnswer = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: VLQuizItem, answer: any): { isCorrect: boolean; score: number } => {
      const data = item.data;

      switch (item.type) {
        case "single-choice": {
          const correctOption = data.options?.find(opt => opt.isCorrect);
          const isCorrect = answer === correctOption?.id;
          return { isCorrect, score: isCorrect ? 1 : 0 };
        }
        case "multiple-choice": {
          const correctIds = new Set(
            data.options?.filter(opt => opt.isCorrect).map(opt => opt.id) ?? []
          );
          const userIds = new Set(answer ?? []);
          const isCorrect =
            correctIds.size === userIds.size && [...correctIds].every(id => userIds.has(id));
          return { isCorrect, score: isCorrect ? 1 : 0 };
        }
        case "cloze": {
          const blanks = extractBlanksFromContent(item.prompt);
          let correctCount = 0;
          blanks.forEach(blank => {
            const userAnswer = answer?.[blank.blankId]?.trim().toLowerCase();
            const correctAnswer = blank.answer.trim().toLowerCase();
            const alternatives = blank.alternativeAnswers?.map(a => a.trim().toLowerCase()) ?? [];
            if (userAnswer === correctAnswer || alternatives.includes(userAnswer ?? "")) {
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
    []
  );

  // 提交当前答案
  const handleSubmitAnswer = useMemoizedFn(() => {
    if (!currentItem || currentAnswer === null || currentAnswer === undefined) return;

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
    setFinishing(true);
    try {
      const record = await finishTest();
      setQuizRecord(record);
      setStep("result");
    } finally {
      setFinishing(false);
    }
  });

  // 关闭弹窗：先通知调用方收起，退场动画结束后再清理测验会话（避免内容在退场中途消失）
  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  const handleAfterClose = useMemoizedFn(() => {
    cancelTest();
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

  // 渲染选择题选项
  const renderChoiceOptions = () => {
    if (!currentItem) return null;
    const data = currentItem.data;
    const isMultiple = currentItem.type === "multiple-choice";

    return (
      <div className="flex flex-col gap-2">
        {(data.options ?? []).map(option => {
          const isSelected = isMultiple
            ? (currentAnswer ?? []).includes(option.id)
            : currentAnswer === option.id;
          const isCorrect = !!option.isCorrect;
          const tone = optionTone(showAnswer, isSelected, isCorrect);
          const Icon = showAnswer
            ? isCorrect
              ? CheckCircle2
              : isSelected
                ? XCircle
                : Circle
            : isSelected
              ? CheckCircle2
              : Circle;

          return (
            <button
              key={option.id}
              type="button"
              disabled={showAnswer}
              onClick={() => {
                if (isMultiple) {
                  const current = currentAnswer ?? [];
                  setCurrentAnswer(
                    current.includes(option.id)
                      ? current.filter((id: string) => id !== option.id)
                      : [...current, option.id]
                  );
                } else {
                  setCurrentAnswer(option.id);
                }
              }}
              className={cn(
                "rounded-tau-md flex w-full items-start gap-3 border px-4 py-3 text-left",
                "ease-tau-out transition-[background-color,border-color] duration-[140ms]",
                showAnswer ? "cursor-default" : "cursor-pointer",
                tone.card
              )}
            >
              <Icon className={cn("mt-[3px] size-4 shrink-0", tone.icon)} strokeWidth={1.75} />
              <span className={cn("text-tau-body leading-relaxed", tone.text)}>{option.label}</span>
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
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: true, label: "正确", icon: CheckCircle2 },
          { value: false, label: "错误", icon: XCircle },
        ].map(option => {
          const isSelected = currentAnswer === option.value;
          const isCorrect = data.booleanAnswer === option.value;
          const tone = optionTone(showAnswer, isSelected, isCorrect);
          const Icon = option.icon;

          return (
            <button
              key={String(option.value)}
              type="button"
              disabled={showAnswer}
              onClick={() => setCurrentAnswer(option.value)}
              className={cn(
                "rounded-tau-md flex flex-col items-center justify-center gap-2 border px-6 py-6",
                "ease-tau-out transition-[background-color,border-color] duration-[140ms]",
                showAnswer ? "cursor-default" : "cursor-pointer",
                tone.card
              )}
            >
              <Icon className={cn("size-6", tone.icon)} strokeWidth={1.75} />
              <span className={cn("text-tau-body font-medium", tone.text)}>{option.label}</span>
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
      <div className="flex flex-col gap-3">
        <Textarea
          data-autofocus
          disabled={showAnswer}
          value={currentAnswer ?? ""}
          onChange={e => setCurrentAnswer(e.target.value)}
          placeholder="请输入你的答案..."
          rows={6}
        />
        {showAnswer && data.answer && (
          <div className="border-line-1 rounded-tau-md border px-4 py-3">
            <p className="text-ok text-tau-meta m-0 mb-1.5 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
              参考答案
            </p>
            <p className="text-ink-2 text-tau-body m-0 whitespace-pre-wrap leading-relaxed">
              {data.answer}
            </p>
          </div>
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
        return <p className="text-ink-2 m-0">未知题型</p>;
    }
  };

  // 渲染作答反馈
  const renderFeedback = () => {
    if (!currentItem || !showAnswer || currentAnswerCorrect === null) return null;
    const positive = currentAnswerCorrect || currentItem.type === "qa";

    return (
      <div className={cn("rounded-tau-md px-4 py-3", positive ? "bg-ok-soft" : "bg-warn-soft")}>
        <p
          className={cn(
            "text-tau-body m-0 flex items-center gap-1.5 font-medium",
            positive ? "text-ok" : "text-warn"
          )}
        >
          {currentItem.type === "qa" ? (
            "自我评估"
          ) : currentAnswerCorrect ? (
            <>
              <Check className="size-4" strokeWidth={1.75} />
              回答正确
            </>
          ) : (
            <>
              <X className="size-4" strokeWidth={1.75} />
              回答错误
            </>
          )}
        </p>
        {currentItem.data.explanation ? (
          <div className="text-ink-2 text-tau-body mt-2 leading-relaxed">
            <span className="text-ink-3 text-tau-meta mb-0.5 block">解析</span>
            {currentItem.data.explanation}
          </div>
        ) : (
          !currentAnswerCorrect &&
          currentItem.type !== "qa" && (
            <p className="text-ink-2 text-tau-meta m-0 mt-1">暂无解析，请参考正确答案。</p>
          )
        )}
      </div>
    );
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
    const config = LEVEL_CONFIG[scoreLevel];

    const stats = [
      {
        icon: Target,
        value: `${quizRecord.correctCount}/${quizRecord.totalCount}`,
        label: "正确率",
      },
      {
        icon: Clock,
        value: `${Math.floor(quizRecord.duration / 60)}:${String(quizRecord.duration % 60).padStart(2, "0")}`,
        label: "用时",
      },
      { icon: Trophy, value: String(quizRecord.totalCount), label: "总题数" },
    ];

    return (
      <div className="flex flex-col items-center py-6">
        {/* 成绩圆环 */}
        <div
          className={cn(
            "flex size-32 flex-col items-center justify-center rounded-full border-[3px]",
            config.ring
          )}
        >
          <span className={cn("text-[40px] font-semibold tabular-nums leading-none", config.text)}>
            {quizRecord.score.toFixed(0)}
          </span>
          <span className="text-ink-3 text-tau-meta mt-1">分</span>
        </div>

        {/* 评语 */}
        <p className={cn("m-0 mt-4 text-[16px] font-semibold", config.text)}>{config.label}</p>

        {/* 统计 */}
        <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-3">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="border-line-1 rounded-tau-md flex flex-col items-center border px-3 py-3"
              >
                <Icon className="text-ink-3 mb-1.5 size-4" strokeWidth={1.75} />
                <span className="text-ink-1 text-[15px] font-semibold tabular-nums">
                  {stat.value}
                </span>
                <span className="text-ink-3 text-tau-meta">{stat.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (!currentItem || !progress) {
    return null;
  }

  const testingFooter = (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={ChevronLeft}
        className="mr-auto"
        disabled={progress.current <= 1}
        onClick={handlePrev}
      >
        上一题
      </Button>
      {!showAnswer ? (
        <Button
          variant="primary"
          size="sm"
          disabled={!canSubmitAnswer}
          onClick={handleSubmitAnswer}
        >
          提交答案
        </Button>
      ) : isLastQuestion ? (
        <Button variant="primary" size="sm" loading={finishing} onClick={handleFinish}>
          完成测验
        </Button>
      ) : (
        <Button variant="primary" size="sm" onClick={handleNext}>
          下一题
          <ChevronRight className="-mr-0.5 size-4" strokeWidth={1.75} />
        </Button>
      )}
    </>
  );

  const resultFooter = (
    <Button variant="primary" size="sm" onClick={handleClose}>
      完成测验
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && handleClose()}
      onAfterClose={handleAfterClose}
      title={quizSet?.name || "测验"}
      icon={
        quizSet?.emoji ? (
          <span className="text-[14px] leading-none">{quizSet.emoji}</span>
        ) : undefined
      }
      subtitle={
        step === "testing"
          ? `第 ${progress.current} / ${progress.total} 题 · ${TYPE_LABELS[currentItem.type] || currentItem.type}`
          : "测验结果"
      }
      width={680}
      locked={finishing}
      footer={step === "testing" ? testingFooter : resultFooter}
    >
      {step === "testing" && (
        <div className="flex flex-col gap-5 pt-1">
          {/* 进度 */}
          <div className="bg-track h-1 overflow-hidden rounded-full">
            <div
              className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-[400ms]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* 题干 */}
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
                className="text-ink-1 text-[17px] font-medium leading-normal"
              />
            )}

            {currentItem.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {currentItem.tags.map(tag => (
                  <span
                    key={tag}
                    className="border-line-1 text-ink-2 text-tau-sm rounded-full border px-2 py-0.5"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 作答区 */}
          {renderQuestionContent()}

          {/* 作答反馈 */}
          {renderFeedback()}
        </div>
      )}

      {step === "result" && renderResult()}
    </Dialog>
  );
});

QuizTestModal.displayName = "QuizTestModal";

export default QuizTestModal;
