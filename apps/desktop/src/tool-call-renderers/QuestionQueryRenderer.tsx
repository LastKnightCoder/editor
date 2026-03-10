import { useEffect, useMemo, useState } from "react";
import type { ToolCallCustomRendererProps } from "./types";
import type { IAnswer } from "@/types";
import AnswerCardList from "@/components/AnswerCardList";
import AnswerModal from "@/components/AnswerModal";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import {
  getQuestionAnswerList,
  getQuestionDashboardData,
  getQuestionDetail,
  getQuestionGroupDetail,
  queryQuestionGroups,
  queryQuestions,
  type QuestionAnswerListResult,
  type QuestionDashboardResult,
  type QuestionDetailResult,
  type QuestionGroupDetailResult,
  type QuestionGroupQueryResult,
  type QuestionQueryResult,
} from "@/mcp/question/query";
import { subscribeQuestionMutationEvent } from "@/mcp/question/events";
import { shouldRefreshQuestionResult } from "@/mcp/question/mutation";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolSectionTitle,
  ToolValuePill,
} from "./ui";

type QuestionRendererData =
  | QuestionDashboardResult
  | QuestionGroupQueryResult
  | QuestionQueryResult
  | QuestionGroupDetailResult
  | QuestionDetailResult
  | QuestionAnswerListResult;

const parseOutput = (output?: string): QuestionRendererData | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as QuestionRendererData;
    return parsed && typeof parsed === "object" && "kind" in parsed
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const QueryRefreshButton = ({
  isDark,
  loading,
  onRefresh,
}: {
  isDark: boolean;
  loading: boolean;
  onRefresh: () => void;
}) => (
  <button
    type="button"
    className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
      loading
        ? isDark
          ? "cursor-not-allowed bg-slate-800 text-slate-500"
          : "cursor-not-allowed bg-slate-100 text-slate-400"
        : isDark
          ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
    }`}
    disabled={loading}
    onClick={onRefresh}
  >
    {loading ? "刷新中..." : "刷新"}
  </button>
);

const StatusBadge = ({
  status,
  isDark,
}: {
  status: string;
  isDark: boolean;
}) => <ToolBadge isDark={isDark}>{status}</ToolBadge>;

const QuestionQueryRenderer = ({
  execution,
  isDark,
  parsedInput,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const initialData = useMemo(
    () => parseOutput(execution.output),
    [execution.output],
  );
  const [data, setData] = useState<QuestionRendererData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(
    null,
  );
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const queryInput = (parsedInput ?? null) as Record<string, unknown> | null;
  const extensions = useDynamicExtensionsStore((state) => state.extensions);

  const refresh = async () => {
    setLoading(true);
    try {
      setUnavailableMessage(null);
      switch (execution.toolName) {
        case "get_question_dashboard":
          setData(await getQuestionDashboardData());
          break;
        case "query_question_groups":
          setData(
            await queryQuestionGroups({
              ids: queryInput?.ids as number[] | undefined,
              names: queryInput?.names as string[] | undefined,
              includeDefault: queryInput?.includeDefault as boolean | undefined,
              page: queryInput?.page as number | undefined,
              pageSize: queryInput?.pageSize as number | undefined,
            }),
          );
          break;
        case "get_question_group_detail": {
          const next = await getQuestionGroupDetail({
            groupId: Number(queryInput?.groupId),
            page: queryInput?.page as number | undefined,
            pageSize: queryInput?.pageSize as number | undefined,
          });
          if (!next) {
            setUnavailableMessage("分组已不可用，可能已被删除。");
            setData(null);
            break;
          }
          setData(next);
          break;
        }
        case "query_questions":
          setData(await queryQuestions(queryInput as Record<string, unknown>));
          break;
        case "get_question_detail": {
          const next = await getQuestionDetail(Number(queryInput?.questionId));
          if (!next) {
            setUnavailableMessage("问题已不可用，可能已被删除。");
            setData(null);
            break;
          }
          setData(next);
          break;
        }
        case "get_question_answers": {
          const next = await getQuestionAnswerList(
            Number(queryInput?.questionId),
          );
          if (!next) {
            setUnavailableMessage("问题已不可用，可能已被删除。");
            setData(null);
            break;
          }
          setData(next);
          break;
        }
      }
    } catch (error) {
      console.error("[question-renderer] refresh failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(initialData);
    setUnavailableMessage(null);
  }, [initialData]);

  const answerItems = useMemo(() => {
    if (!data) {
      return [] as IAnswer[];
    }

    if (data.kind === "question-detail") {
      return data.data.answers.map((answer) => ({
        id: answer.id,
        content: answer.content,
        createTime: answer.createTime,
        updateTime: answer.updateTime,
      }));
    }

    if (data.kind === "question-answer-list") {
      return data.items.map((answer) => ({
        id: answer.id,
        content: answer.content,
        createTime: answer.createTime,
        updateTime: answer.updateTime,
      }));
    }

    return [] as IAnswer[];
  }, [data]);

  const selectedAnswer = useMemo(
    () => answerItems.find((item) => item.id === selectedAnswerId) ?? null,
    [answerItems, selectedAnswerId],
  );

  const handleAnswerChange = (nextAnswer: IAnswer) => {
    setData((prev) => {
      if (!prev) {
        return prev;
      }
      if (prev.kind === "question-detail") {
        return {
          ...prev,
          data: {
            ...prev.data,
            answers: prev.data.answers.map((answer) =>
              answer.id === nextAnswer.id
                ? {
                    ...answer,
                    content: nextAnswer.content,
                    preview: answer.preview,
                    markdown: answer.markdown,
                    updateTime: nextAnswer.updateTime,
                  }
                : answer,
            ),
          },
        };
      }
      if (prev.kind === "question-answer-list") {
        return {
          ...prev,
          items: prev.items.map((answer) =>
            answer.id === nextAnswer.id
              ? {
                  ...answer,
                  content: nextAnswer.content,
                  updateTime: nextAnswer.updateTime,
                }
              : answer,
          ),
        };
      }
      return prev;
    });
  };

  useEffect(() => {
    if (!data) {
      return;
    }
    return subscribeQuestionMutationEvent((event) => {
      if (
        shouldRefreshQuestionResult({
          event,
          toolName: execution.toolName,
          parsedInput: queryInput,
          payloadKind: data.kind,
          payloadEntityType: "entityType" in data ? data.entityType : undefined,
          payloadId:
            "id" in data
              ? data.id
              : "questionId" in data
                ? data.questionId
                : null,
        })
      ) {
        void refresh();
      }
    });
  }, [data, execution.toolName, queryInput]);

  if (!data && !unavailableMessage) {
    return <>{renderDefault()}</>;
  }

  if (unavailableMessage) {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <QueryRefreshButton
                isDark={isDark}
                loading={loading}
                onRefresh={() => void refresh()}
              />
            }
          >
            详情已失效
          </ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <ToolMutedText isDark={isDark}>{unavailableMessage}</ToolMutedText>
        </ToolCardBody>
      </ToolCard>
    );
  }

  if (!data) {
    return <>{renderDefault()}</>;
  }

  const renderQuestionItem = (
    item:
      | QuestionQueryResult["items"][number]
      | QuestionDashboardResult["recentQuestions"][number],
  ) => (
    <div
      key={item.id}
      className={`rounded-xl border p-3 ${
        isDark
          ? "border-white/10 bg-slate-950/40"
          : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          className={`min-w-0 flex-1 text-sm font-medium ${
            isDark ? "text-slate-100" : "text-slate-800"
          }`}
        >
          {item.questionContent}
        </div>
        <StatusBadge status={item.status} isDark={isDark} />
      </div>
      <ToolMutedText isDark={isDark} className="mt-1 break-words">
        {item.groupTitle ? `分组：${item.groupTitle}` : "未分组"} · 答案{" "}
        {item.answerCount}
      </ToolMutedText>
      {item.descriptionPreview ? (
        <ToolMutedText isDark={isDark} className="mt-2 break-words">
          {item.descriptionPreview}
        </ToolMutedText>
      ) : null}
    </div>
  );

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark} divided>
        <ToolSectionTitle
          isDark={isDark}
          action={
            <QueryRefreshButton
              isDark={isDark}
              loading={loading}
              onRefresh={() => void refresh()}
            />
          }
        >
          {data.kind === "question-dashboard"
            ? "问题管理总览"
            : data.kind === "question-group-query-result"
              ? "问题分组查询结果"
              : data.kind === "question-query-result"
                ? "问题查询结果"
                : data.kind === "question-group-detail"
                  ? "问题分组详情"
                  : data.kind === "question-detail"
                    ? "问题详情"
                    : "问题答案"}
        </ToolSectionTitle>
      </ToolCardHeader>
      <ToolCardBody>
        {data.kind === "question-dashboard" ? (
          <>
            <div className="flex flex-wrap gap-2">
              <ToolValuePill isDark={isDark}>
                总数：{data.summary.totalQuestions}
              </ToolValuePill>
              <ToolValuePill isDark={isDark}>
                未回答：{data.summary.unansweredQuestions}
              </ToolValuePill>
              <ToolValuePill isDark={isDark}>
                处理中：{data.summary.inProgressQuestions}
              </ToolValuePill>
              <ToolValuePill isDark={isDark}>
                已解决：{data.summary.resolvedQuestions}
              </ToolValuePill>
            </div>
            <div className="space-y-2">
              {data.unresolvedQuestions.slice(0, 5).map(renderQuestionItem)}
            </div>
          </>
        ) : null}

        {data.kind === "question-group-query-result" ? (
          <div className="space-y-2">
            {data.items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${
                  isDark
                    ? "border-white/10 bg-slate-950/40"
                    : "border-slate-200 bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`text-sm font-medium ${
                      isDark ? "text-slate-100" : "text-slate-800"
                    }`}
                  >
                    {item.title}
                  </div>
                  {item.isDefault ? (
                    <ToolBadge isDark={isDark}>默认</ToolBadge>
                  ) : null}
                </div>
                <ToolMutedText isDark={isDark} className="mt-1">
                  共 {item.totalCount} 题，已回答 {item.answeredCount}，未回答{" "}
                  {item.unansweredCount}
                </ToolMutedText>
              </div>
            ))}
          </div>
        ) : null}

        {data.kind === "question-query-result" ? (
          <div className="space-y-2">
            <ToolMutedText isDark={isDark}>
              共 {data.summary.totalCount} 条，第 {data.summary.page} 页
            </ToolMutedText>
            {data.items.map(renderQuestionItem)}
          </div>
        ) : null}

        {data.kind === "question-group-detail" ? (
          <>
            <div className="flex flex-wrap gap-2">
              <ToolValuePill isDark={isDark}>
                共 {data.data.totalCount} 题
              </ToolValuePill>
              <ToolValuePill isDark={isDark}>
                已回答 {data.data.answeredCount}
              </ToolValuePill>
              <ToolValuePill isDark={isDark}>
                未回答 {data.data.unansweredCount}
              </ToolValuePill>
            </div>
            <div className="space-y-2">
              {data.data.questions.map(renderQuestionItem)}
            </div>
          </>
        ) : null}

        {data.kind === "question-detail" ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={data.data.status} isDark={isDark} />
              {data.data.groupTitle ? (
                <ToolBadge isDark={isDark}>{data.data.groupTitle}</ToolBadge>
              ) : null}
              <ToolValuePill isDark={isDark}>
                答案 {data.data.answerCount}
              </ToolValuePill>
            </div>
            <div
              className={`text-sm font-medium ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {data.data.questionContent}
            </div>
            {data.data.descriptionPreview ? (
              <ToolMutedText isDark={isDark} className="break-words">
                {data.data.descriptionPreview}
              </ToolMutedText>
            ) : null}
            {data.data.answers.length ? (
              <AnswerCardList
                answers={answerItems}
                readOnly
                onViewAnswer={(answerId) => setSelectedAnswerId(answerId)}
              />
            ) : (
              <ToolMutedText isDark={isDark}>当前没有关联答案。</ToolMutedText>
            )}
          </>
        ) : null}

        {data.kind === "question-answer-list" ? (
          <div className="space-y-2">
            <ToolMutedText isDark={isDark}>
              {data.questionTitle} · 共 {data.summary.totalCount} 条答案
            </ToolMutedText>
            {data.items.length ? (
              <AnswerCardList
                answers={answerItems}
                readOnly
                onViewAnswer={(answerId) => setSelectedAnswerId(answerId)}
              />
            ) : (
              <ToolMutedText isDark={isDark}>当前没有关联答案。</ToolMutedText>
            )}
          </div>
        ) : null}
      </ToolCardBody>
      <AnswerModal
        visible={selectedAnswerId != null}
        selectedAnswer={selectedAnswer}
        extensions={extensions}
        onClose={() => setSelectedAnswerId(null)}
        onAnswerChange={handleAnswerChange}
        readOnly={false}
        customTitle="答案详情"
      />
    </ToolCard>
  );
};

export default QuestionQueryRenderer;
