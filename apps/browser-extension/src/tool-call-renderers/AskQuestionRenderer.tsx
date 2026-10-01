import { useMemo, useState, useEffect } from "react";
import classNames from "classnames";
import type { ToolCallCustomRendererProps } from "@tau/chat-ui/renderers";
import { CustomCheckbox } from "@tau/shared";
import {
  normalizeAskQuestionPayload,
  type AskQuestionAnswerItem,
  type AskQuestionSubmission,
  type AskQuestionToolResult,
} from "@/tools/askQuestionTypes";
import { useRunInteractionStore } from "@/stores/useRunInteractionStore";

const buildInitialSelectedMap = (answers: AskQuestionAnswerItem[] | undefined) =>
  (answers || []).reduce<Record<string, string[]>>((acc, answer) => {
    acc[answer.questionId] = answer.selectedValues || [];
    return acc;
  }, {});

const buildInitialOtherMap = (answers: AskQuestionAnswerItem[] | undefined) =>
  (answers || []).reduce<Record<string, string>>((acc, answer) => {
    acc[answer.questionId] = answer.otherText || "";
    return acc;
  }, {});

const isTransientStreamingState = (status: string) =>
  status === "pending" || status === "executing" || status === "retrying";

const parseOutputResult = (output?: string): AskQuestionToolResult | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as AskQuestionToolResult;
    if (parsed?.type !== "ask-question-result" || !Array.isArray(parsed.answers)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const AskQuestionRenderer = ({
  execution,
  isDark,
  parsedInput,
  inputParseError,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  // 提问是桌面宿主原生的（M5）：这轮回答里宿主在等这个调用的作答
  const hostQuestion = useRunInteractionStore(state =>
    state.questions.find(question => question.toolCallId === execution.toolCallId)
  );
  const answerHost = useRunInteractionStore(state => state.answer);
  const [hostSubmitting, setHostSubmitting] = useState(false);
  const [hostSubmitted, setHostSubmitted] = useState<AskQuestionSubmission | undefined>();

  const normalized = useMemo(
    () => normalizeAskQuestionPayload(hostQuestion?.payload ?? parsedInput),
    [hostQuestion?.payload, parsedInput]
  );
  const executionIdentity = useMemo(
    () =>
      JSON.stringify({
        toolCallId: execution.toolCallId,
        rawInput: execution.input,
        timestamp: execution.timestamp,
      }),
    [execution.input, execution.timestamp, execution.toolCallId]
  );

  const payload = normalized.payload;
  const outputResult = useMemo(() => parseOutputResult(execution.output), [execution.output]);
  const submittedAnswers = useMemo(() => {
    if (hostSubmitted) {
      return hostSubmitted;
    }
    if (!outputResult) {
      return undefined;
    }
    return {
      submittedAt: outputResult.submittedAt,
      answers: outputResult.answers.map(item => ({
        questionId: item.questionId,
        selectedValues: item.selectedOptions.map(option => option.value),
        otherText: item.otherText || "",
      })),
    };
  }, [outputResult, hostSubmitted]);

  const [selectedValuesMap, setSelectedValuesMap] = useState<Record<string, string[]>>(() =>
    buildInitialSelectedMap(submittedAnswers?.answers)
  );
  const [otherTextMap, setOtherTextMap] = useState<Record<string, string>>(() =>
    buildInitialOtherMap(submittedAnswers?.answers)
  );
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedValuesMap(buildInitialSelectedMap(submittedAnswers?.answers));
    setOtherTextMap(buildInitialOtherMap(submittedAnswers?.answers));
    setError("");
  }, [executionIdentity, submittedAnswers]);

  const displayAnswerMap = useMemo(
    () => new Map((submittedAnswers?.answers || []).map(answer => [answer.questionId, answer])),
    [submittedAnswers?.answers]
  );

  if (!payload) {
    if (!isTransientStreamingState(execution.status)) {
      console.warn("[ask-question] 无法解析工具输入", {
        toolCallId: execution.toolCallId,
        inputParseError,
        normalizedError: normalized.error,
      });
    }
    return <>{renderDefault()}</>;
  }

  // 宿主还在等才可作答；宿主不在等且没有结果 = 已中断（重启后宿主补了失败结果）
  const hostLive = Boolean(hostQuestion) && !hostSubmitted;
  const isLocked =
    execution.status === "success" || execution.status === "failed" || hostSubmitting || !hostLive;

  const handleSelectOption = (questionId: string, optionValue: string, isMultiple: boolean) => {
    if (isLocked) return;
    setError("");
    setSelectedValuesMap(prev => {
      const current = prev[questionId] || [];
      if (!isMultiple) {
        return {
          ...prev,
          [questionId]: [optionValue],
        };
      }

      const exists = current.includes(optionValue);
      return {
        ...prev,
        [questionId]: exists
          ? current.filter(value => value !== optionValue)
          : [...current, optionValue],
      };
    });
  };

  const handleSubmit = () => {
    if (isLocked) return;

    const answers: AskQuestionAnswerItem[] = payload.questions.map(question => {
      const selectedValues = selectedValuesMap[question.id] || [];
      const otherText = (otherTextMap[question.id] || "").trim();
      return {
        questionId: question.id,
        selectedValues,
        otherText,
      };
    });

    const missingQuestion = payload.questions.find(question => {
      if (!question.required) return false;
      const answer = answers.find(item => item.questionId === question.id);
      const hasSelected = (answer?.selectedValues || []).length > 0;
      const hasOther = Boolean(answer?.otherText?.trim());
      return !hasSelected && !hasOther;
    });

    if (missingQuestion) {
      setError(`请先回答：${missingQuestion.question}`);
      return;
    }

    const submission: AskQuestionSubmission = {
      answers,
      submittedAt: Date.now(),
    };

    if (!hostQuestion || !answerHost) {
      setError("这轮回答已结束，无法提交");
      return;
    }
    setHostSubmitting(true);
    setError("");
    // 宿主按答案数组校验（pi-user-questions 的 toSubmission）
    answerHost(hostQuestion.requestId, submission.answers)
      .then(() => setHostSubmitted(submission))
      .catch((submitError: unknown) =>
        setError(submitError instanceof Error ? submitError.message : String(submitError))
      )
      .finally(() => setHostSubmitting(false));
  };

  const checkboxAccentColor = isDark ? "#38bdf8" : "#0284c7";

  return (
    <div
      className={classNames(
        "my-3 overflow-hidden rounded-2xl border backdrop-blur-xl",
        isDark ? "border-white/10 bg-zinc-900/80" : "border-slate-200/80 bg-white/80"
      )}
    >
      <div
        className={classNames(
          "border-b px-5 py-4",
          isDark ? "border-white/10" : "border-slate-200/70"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-xl",
              isDark
                ? "border border-sky-400/30 bg-sky-400/15 text-sky-300"
                : "border border-sky-200 bg-sky-50 text-sky-600"
            )}
          >
            ?
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={classNames(
                "truncate text-sm font-semibold",
                isDark ? "text-slate-100" : "text-slate-800"
              )}
            >
              {payload.title || "进一步确认需求"}
            </div>
            {payload.description && (
              <div
                className={classNames(
                  "mt-0.5 text-xs",
                  isDark ? "text-slate-400" : "text-slate-500"
                )}
              >
                {payload.description}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {payload.questions.map((question, questionIndex) => {
          const selectedValues = selectedValuesMap[question.id] || [];
          const otherText = otherTextMap[question.id] || "";
          const answerSummary = displayAnswerMap.get(question.id);

          return (
            <div
              key={question.id}
              className={classNames(
                "rounded-xl border p-4",
                isDark ? "border-white/10 bg-zinc-950/50" : "border-slate-200 bg-slate-50/70"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={classNames(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold",
                    isDark
                      ? "border border-slate-700 bg-zinc-800 text-slate-300"
                      : "border border-slate-200 bg-white text-slate-600"
                  )}
                >
                  {questionIndex + 1}
                </span>
                <div
                  className={classNames(
                    "text-sm font-medium",
                    isDark ? "text-slate-100" : "text-slate-800"
                  )}
                >
                  {question.question}
                </div>
                <span
                  className={classNames(
                    "ml-auto text-[11px]",
                    isDark ? "text-slate-500" : "text-slate-400"
                  )}
                >
                  {question.type === "multiple" ? "多选" : "单选"}
                  {question.required ? " · 必答" : " · 可选"}
                </span>
              </div>

              <div className="mt-3 grid gap-2">
                {question.options.map(option => {
                  const active = selectedValues.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isLocked}
                      onClick={() =>
                        handleSelectOption(question.id, option.value, question.type === "multiple")
                      }
                      className={classNames(
                        "w-full rounded-lg border px-3 py-2 text-left transition-all",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70",
                        active
                          ? isDark
                            ? "border-sky-300/60 bg-sky-400/15 text-slate-100"
                            : "border-sky-300 bg-sky-50 text-slate-900"
                          : isDark
                            ? "border-white/10 bg-zinc-900/40 text-slate-300 hover:bg-zinc-800/60"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        isLocked && "cursor-not-allowed opacity-80"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {question.type === "multiple" ? (
                          <CustomCheckbox
                            checked={active}
                            onChange={() => handleSelectOption(question.id, option.value, true)}
                            readonly={isLocked}
                            accentColor={checkboxAccentColor}
                            className="!mt-0 self-center"
                          />
                        ) : (
                          <span
                            className={classNames(
                              "flex h-[16px] w-[16px] shrink-0 items-center justify-center self-center rounded-full border-[1.5px] transition-all",
                              active
                                ? isDark
                                  ? "border-sky-300 bg-sky-400/20"
                                  : "border-sky-500 bg-sky-100"
                                : isDark
                                  ? "border-slate-600 bg-transparent"
                                  : "border-slate-300 bg-transparent"
                            )}
                          >
                            <span
                              className={classNames(
                                "h-[6px] w-[6px] rounded-full transition-all",
                                active ? (isDark ? "bg-sky-300" : "bg-sky-500") : "bg-transparent"
                              )}
                            />
                          </span>
                        )}
                        <span className="text-sm leading-5">{option.label}</span>
                      </div>
                      {option.description && (
                        <div
                          className={classNames(
                            "mt-1 pl-7 text-xs",
                            isDark ? "text-slate-500" : "text-slate-500"
                          )}
                        >
                          {option.description}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <input
                  value={otherText}
                  disabled={isLocked}
                  onChange={event =>
                    setOtherTextMap(prev => ({
                      ...prev,
                      [question.id]: event.target.value,
                    }))
                  }
                  placeholder="其他选项（可自定义输入）"
                  className={classNames(
                    "w-full rounded-xl border px-3 py-2 text-sm outline-none transition-all",
                    "focus:border-sky-400 focus:ring-2 focus:ring-sky-300/30",
                    isDark
                      ? "border-slate-700 bg-zinc-900 text-slate-100 placeholder:text-slate-500"
                      : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400",
                    isLocked && "cursor-not-allowed opacity-80"
                  )}
                />
              </div>

              {isLocked && answerSummary && (
                <div
                  className={classNames(
                    "mt-3 rounded-lg px-3 py-2 text-xs",
                    isDark
                      ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}
                >
                  已提交：
                  {(answerSummary.selectedValues || []).join("、") || "无"}
                  {answerSummary.otherText ? `；其他：${answerSummary.otherText}` : ""}
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <div
            className={classNames(
              "rounded-lg border px-3 py-2 text-xs",
              isDark
                ? "border-red-400/35 bg-red-500/10 text-red-300"
                : "border-red-200 bg-red-50 text-red-600"
            )}
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className={classNames("text-xs", isDark ? "text-slate-500" : "text-slate-500")}>
            {!isLocked
              ? "请完成选择后提交答案"
              : submittedAnswers
                ? "答案已提交，等待模型继续响应"
                : isTransientStreamingState(execution.status) && !execution.output
                  ? "正在准备问题…"
                  : "提问已结束，这次没有得到回答"}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLocked}
            className={classNames(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
              isLocked
                ? isDark
                  ? "cursor-not-allowed bg-zinc-700 text-slate-400"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-sky-500 text-white hover:bg-sky-600"
            )}
          >
            {payload.submitLabel || "提交答案"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AskQuestionRenderer;
