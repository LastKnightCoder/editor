import { useEffect, useId, useMemo, useState } from "react";
import { Check, CircleAlert, MessageCircleQuestion } from "lucide-react";
import { Button, Checkbox, Input, Radio, cn } from "@tau/ui";
import type { ToolCallCustomRendererProps } from "./types";
import { ToolCard, ToolCardHeader } from "./ui";
import {
  normalizeAskQuestionPayload,
  type AskQuestionAnswerItem,
  type AskQuestionSubmission,
  type AskQuestionToolResult,
} from "@/tools/askQuestionTypes";
import { useAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";

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
  const sessionRecord = useAskQuestionSessionStore(state =>
    state.findRecordByExecution({
      toolCallId: execution.toolCallId,
      rawInput: execution.input,
      timestamp: execution.timestamp,
    })
  );
  const submitAnswers = useAskQuestionSessionStore(state => state.submitAnswersByExecution);

  const normalized = useMemo(() => {
    if (sessionRecord?.payload) {
      return { payload: sessionRecord.payload };
    }
    return normalizeAskQuestionPayload(parsedInput);
  }, [sessionRecord?.payload, parsedInput]);
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
    if (sessionRecord?.submittedAnswers) {
      return sessionRecord.submittedAnswers;
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
  }, [outputResult, sessionRecord?.submittedAnswers]);

  const [selectedValuesMap, setSelectedValuesMap] = useState<Record<string, string[]>>(() =>
    buildInitialSelectedMap(submittedAnswers?.answers)
  );
  const [otherTextMap, setOtherTextMap] = useState<Record<string, string>>(() =>
    buildInitialOtherMap(submittedAnswers?.answers)
  );
  const [error, setError] = useState("");
  const fieldIdBase = useId();

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

  const isLocked =
    sessionRecord?.status === "submitted" ||
    sessionRecord?.status === "completed" ||
    execution.status === "success";

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

    const submitResult = submitAnswers(
      {
        toolCallId: execution.toolCallId,
        rawInput: execution.input,
        timestamp: execution.timestamp,
      },
      submission
    );
    if (submitResult === "missing") {
      setError("提交失败：未找到对应问答会话，请重试。");
      return;
    }
    setError("");
  };

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <div className="flex items-start gap-2">
          <MessageCircleQuestion
            aria-hidden
            size={16}
            strokeWidth={1.75}
            className="text-accent-text mt-px shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-tau-body text-ink-1 truncate font-semibold">
              {payload.title || "进一步确认需求"}
            </div>
            {payload.description && (
              <div className="text-tau-meta text-ink-3 mt-0.5 break-words">
                {payload.description}
              </div>
            )}
          </div>
        </div>
      </ToolCardHeader>

      <div className="space-y-4 px-3.5 pb-3.5 pt-2">
        {payload.questions.map((question, questionIndex) => {
          const selectedValues = selectedValuesMap[question.id] || [];
          const otherText = otherTextMap[question.id] || "";
          const answerSummary = displayAnswerMap.get(question.id);
          const isMultiple = question.type === "multiple";
          const groupName = `${fieldIdBase}-${question.id}`;

          return (
            <div key={question.id} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-tau-sm text-ink-3 shrink-0 tabular-nums">
                  {questionIndex + 1}.
                </span>
                <div className="text-tau-body text-ink-1 min-w-0 flex-1 break-words font-medium">
                  {question.question}
                </div>
                <span className="text-tau-tiny text-ink-3 shrink-0">
                  {isMultiple ? "多选" : "单选"}
                  {question.required ? " · 必答" : " · 可选"}
                </span>
              </div>

              <div role={isMultiple ? "group" : "radiogroup"} className="grid gap-0.5">
                {question.options.map((option, optionIndex) => {
                  const active = selectedValues.includes(option.value);
                  const optionId = `${groupName}-${optionIndex}`;
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "rounded-tau-sm ease-tau-out px-1.5 py-1 transition-colors duration-[140ms]",
                        active ? "bg-selected" : !isLocked && "hover:bg-hover",
                        "[&>label]:flex [&>label]:w-full"
                      )}
                    >
                      {isMultiple ? (
                        <div
                          className={cn(
                            "flex gap-2",
                            option.description ? "items-start" : "items-center"
                          )}
                        >
                          <Checkbox
                            id={optionId}
                            checked={active}
                            disabled={isLocked}
                            onChange={() => handleSelectOption(question.id, option.value, true)}
                          />
                          <label
                            htmlFor={optionId}
                            className={cn(
                              "flex min-w-0 flex-1 flex-col gap-px",
                              isLocked ? "cursor-default opacity-55" : "cursor-pointer",
                              option.description && "pt-[2px]"
                            )}
                          >
                            <span className="text-tau-body text-ink-1">{option.label}</span>
                            {option.description && (
                              <span className="text-tau-meta text-ink-3 leading-[1.55]">
                                {option.description}
                              </span>
                            )}
                          </label>
                        </div>
                      ) : (
                        <Radio
                          name={groupName}
                          value={option.value}
                          checked={active}
                          disabled={isLocked}
                          onChange={() => handleSelectOption(question.id, option.value, false)}
                          label={option.label}
                          description={option.description || undefined}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <Input
                size="sm"
                value={otherText}
                disabled={isLocked}
                onChange={event =>
                  setOtherTextMap(prev => ({
                    ...prev,
                    [question.id]: event.target.value,
                  }))
                }
                placeholder="其他选项（可自定义输入）"
              />

              {isLocked && answerSummary && (
                <div className="text-tau-sm text-ok flex items-start gap-1.5">
                  <Check aria-hidden size={14} strokeWidth={2} className="mt-px shrink-0" />
                  <span className="min-w-0 break-words">
                    已提交：
                    {(answerSummary.selectedValues || []).join("、") || "无"}
                    {answerSummary.otherText ? `；其他：${answerSummary.otherText}` : ""}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <div role="alert" className="text-tau-sm text-danger flex items-start gap-1.5">
            <CircleAlert aria-hidden size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="text-tau-sm text-ink-3">
            {isLocked ? "答案已提交，等待模型继续响应" : "请完成选择后提交答案"}
          </div>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isLocked}>
            {payload.submitLabel || "提交答案"}
          </Button>
        </div>
      </div>
    </ToolCard>
  );
};

export default AskQuestionRenderer;
