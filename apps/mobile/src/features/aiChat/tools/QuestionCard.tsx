// 提问卡（ask-question）：选项是整行可点块，多个问题分页、一次答一题；「其他」点开换成输入框。
// 作答后收成只读的问答小卡；宿主已没有这条等待（中止 / 重启）时只剩一行「已中断」。

import { useMemo, useState } from "react";
import { Check, CircleAlert, CircleCheck, MessageCircleQuestion, Pencil } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import {
  findUnansweredQuestion,
  normalizeAskQuestionPayload,
  type AskQuestionAnswerItem,
  type AskQuestionPayload,
  type AskQuestionToolResult,
} from "@tau/shared/chat-core";
import { getToolInteractionHost, useToolInteraction } from "@tau/chat-ui/conversation";
import { Spinner, cn } from "@tau/ui";
import { parseObject } from "./format";
import { TimelineRow } from "./ToolRow";

type Answers = Record<string, AskQuestionAnswerItem>;

function resultOf(output: string | undefined): AskQuestionToolResult | null {
  const parsed = parseObject(output) as AskQuestionToolResult | null;
  return parsed?.type === "ask-question-result" && Array.isArray(parsed.answers) ? parsed : null;
}

/** 作答后的只读小卡：每题一行「问题 / ✓ 回答」 */
function AnsweredCard(props: { rows: Array<{ question: string; answer: string }> }) {
  return (
    <div className="bg-surface my-1.5 space-y-2 rounded-[18px] px-3.5 py-2.5">
      {props.rows.map((row, index) => (
        <div key={index}>
          <div className="text-tau-sm text-ink-3">{row.question}</div>
          <div className="text-tau-meta text-ink-1 mt-0.5 flex items-start gap-1.5 font-semibold">
            <CircleCheck size={15} aria-hidden className="text-ok mt-[2px] shrink-0" />
            <span className="min-w-0 break-words">{row.answer || "没有回答"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function answeredRows(payload: AskQuestionPayload | undefined, answers: AskQuestionAnswerItem[]) {
  return answers.map(answer => {
    const question = payload?.questions.find(item => item.id === answer.questionId);
    const labels = answer.selectedValues.map(
      value => question?.options.find(option => option.value === value)?.label ?? value
    );
    if (answer.otherText.trim()) labels.push(answer.otherText.trim());
    return { question: question?.question ?? "", answer: labels.join("、") };
  });
}

function Option(props: {
  label: string;
  description?: string;
  selected: boolean;
  multiple: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <button
      type="button"
      role={props.multiple ? "checkbox" : "radio"}
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={props.onPress}
      className={cn(
        "flex min-h-[50px] w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left transition-colors",
        props.selected
          ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
          : "shadow-[inset_0_0_0_1px_var(--tau-line-1)] active:bg-surface-hover"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "text-ink-inverse grid size-[22px] shrink-0 place-items-center border-[1.8px]",
          props.multiple ? "rounded-[7px]" : "rounded-full",
          props.selected ? "border-accent bg-accent" : "border-ink-3"
        )}
      >
        {props.selected && <Check size={13} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-tau-body text-ink-1 block">{props.label}</span>
        {props.description && (
          <span className="text-tau-sm text-ink-3 mt-px block leading-[1.45]">
            {props.description}
          </span>
        )}
      </span>
    </button>
  );
}

export function QuestionCard(props: { execution: ToolCallExecutionState; linked?: boolean }) {
  const { execution } = props;
  const pending = useToolInteraction(execution, (host, item) => host.questionOf(item), undefined);
  const ready = useToolInteraction(execution, (host, item) => host.isReady(item), false);
  const payload = useMemo(
    () => pending?.payload ?? normalizeAskQuestionPayload(parseObject(execution.input)).payload,
    [pending?.payload, execution.input]
  );
  const result = useMemo(() => resultOf(execution.output), [execution.output]);
  const [sent, setSent] = useState<AskQuestionAnswerItem[]>();
  const [answers, setAnswers] = useState<Answers>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (result)
    return (
      <AnsweredCard
        rows={result.answers.map(answer => ({
          question: answer.question,
          answer: [...answer.selectedOptions.map(option => option.label), answer.otherText.trim()]
            .filter(Boolean)
            .join("、"),
        }))}
      />
    );
  if (sent) return <AnsweredCard rows={answeredRows(payload, sent)} />;
  const live = !!pending && ready;
  if (!payload || !live) {
    const preparing = execution.status === "pending" || execution.status === "executing";
    return (
      <TimelineRow
        linked={props.linked}
        tone={preparing ? "default" : "dim"}
        icon={
          preparing ? (
            <Spinner className="size-3.5 border-[1.5px]" />
          ) : (
            <MessageCircleQuestion strokeWidth={1.9} />
          )
        }
        title={preparing ? "正在准备问题" : "向你提问"}
        meta={pending ? "正在恢复问题…" : preparing ? undefined : "已中断"}
        note={!pending && !preparing ? "等待回答时对话已中断，这次提问没有得到回答" : undefined}
      />
    );
  }

  const questions = payload.questions;
  const index = Math.min(page, questions.length - 1);
  const question = questions[index];
  const multiple = question.type === "multiple";
  const answer = answers[question.id] ?? {
    questionId: question.id,
    selectedValues: [],
    otherText: "",
  };
  const last = index === questions.length - 1;
  const update = (next: Partial<AskQuestionAnswerItem>) => {
    setError("");
    setAnswers(current => ({ ...current, [question.id]: { ...answer, ...next } }));
  };
  const choose = (value: string) => {
    const selected = answer.selectedValues.includes(value);
    update({
      selectedValues: multiple
        ? selected
          ? answer.selectedValues.filter(item => item !== value)
          : [...answer.selectedValues, value]
        : [value],
    });
  };
  const answered = answer.selectedValues.length > 0 || !!answer.otherText.trim();

  const submit = async () => {
    const all = questions.map(
      item => answers[item.id] ?? { questionId: item.id, selectedValues: [], otherText: "" }
    );
    const missing = findUnansweredQuestion(payload, all);
    if (missing) {
      setPage(questions.indexOf(missing));
      setError("这一题需要回答");
      return;
    }
    const host = getToolInteractionHost();
    if (!host || !pending) return;
    setSubmitting(true);
    try {
      const trimmed = all.map(item => ({ ...item, otherText: item.otherText.trim() }));
      await host.answerQuestion(execution, pending, trimmed);
      setSent(trimmed);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交回答失败");
    } finally {
      setSubmitting(false);
    }
  };
  const next = () => {
    if (question.required && !answered) {
      setError("这一题需要回答");
      return;
    }
    if (last) void submit();
    else setPage(index + 1);
  };

  return (
    <div className="bg-surface my-1.5 rounded-[20px] px-3.5 pt-3.5 pb-3">
      <div className="text-tau-sm text-ink-3 flex items-center gap-2">
        <MessageCircleQuestion size={16} aria-hidden className="text-accent-text shrink-0" />
        <span className="min-w-0 truncate">
          {payload.title || "AI 想先问你"}
          {questions.length > 1 && ` · ${index + 1}/${questions.length}`}
        </span>
      </div>
      {payload.description && index === 0 && (
        <div className="text-tau-meta text-ink-2 mt-1.5 leading-[1.55]">{payload.description}</div>
      )}
      <div className="text-tau-title text-ink-1 mt-2 mb-2.5 leading-[1.5] font-semibold">
        {question.question}
        {(multiple || !question.required) && (
          <span className="text-tau-sm text-ink-3 ml-1.5 font-normal">
            {[multiple && "可多选", !question.required && "可不答"].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      <div role={multiple ? "group" : "radiogroup"} className="space-y-1.5">
        {question.options.map(option => (
          <Option
            key={option.value}
            label={option.label}
            description={option.description}
            selected={answer.selectedValues.includes(option.value)}
            multiple={multiple}
            disabled={submitting}
            onPress={() => choose(option.value)}
          />
        ))}
        {otherOpen[question.id] || answer.otherText ? (
          <input
            autoFocus={otherOpen[question.id]}
            value={answer.otherText}
            disabled={submitting}
            onChange={event => update({ otherText: event.target.value })}
            placeholder="写下你的回答"
            className="input-text text-ink-1 placeholder:text-ink-3 min-h-[50px] w-full rounded-[14px] bg-transparent px-3 shadow-[inset_0_0_0_1.5px_var(--tau-accent)] outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setOtherOpen(current => ({ ...current, [question.id]: true }))}
            className="text-tau-body text-ink-3 active:bg-surface-hover flex min-h-[50px] w-full items-center gap-3 rounded-[14px] px-3 shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
          >
            <span className="grid size-[22px] shrink-0 place-items-center">
              <Pencil size={14} aria-hidden />
            </span>
            其他，我来写…
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="text-tau-sm text-danger mt-2 flex items-center gap-1.5">
          <CircleAlert size={14} aria-hidden className="shrink-0" />
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <span className="flex flex-1 items-center gap-[5px]" aria-hidden>
          {questions.length > 1 &&
            questions.map((item, dot) => (
              <i
                key={item.id}
                className={cn(
                  "h-1.5 rounded-full",
                  dot === index ? "bg-accent w-4" : "bg-line-2 w-1.5"
                )}
              />
            ))}
        </span>
        {index > 0 && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setPage(index - 1)}
            className="text-tau-meta text-ink-3 h-11 px-2"
          >
            上一题
          </button>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={next}
          className="bg-accent text-ink-inverse text-tau-body h-11 rounded-[14px] px-5 font-semibold active:opacity-80 disabled:opacity-50"
        >
          {last
            ? payload.submitLabel || "提交"
            : !answered && !question.required
              ? "跳过"
              : "下一题"}
        </button>
      </div>
    </div>
  );
}
