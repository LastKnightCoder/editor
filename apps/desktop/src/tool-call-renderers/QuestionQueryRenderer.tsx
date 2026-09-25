import { RotateCw } from "lucide-react";
import { Button } from "@tau/ui";
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
  ToolDividerList,
  ToolDividerListItem,
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
    return parsed && typeof parsed === "object" && "kind" in parsed ? parsed : null;
  } catch {
    return null;
  }
};

const QueryRefreshButton = ({
  loading,
  onRefresh,
}: {
  isDark?: boolean;
  loading: boolean;
  onRefresh: () => void;
}) => (
  <Button
    variant="ghost"
    size="sm"
    icon={RotateCw}
    loading={loading}
    loadingText="刷新中..."
    onClick={onRefresh}
    className="-my-1 -mr-1.5 h-[26px] px-2"
  >
    刷新
  </Button>
);

const StatusBadge = ({ status, isDark }: { status: string; isDark: boolean }) => (
  <ToolBadge isDark={isDark}>{status}</ToolBadge>
);

const QuestionQueryRenderer = ({
  execution,
  isDark,
  parsedInput,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const initialData = useMemo(() => parseOutput(execution.output), [execution.output]);
  const [data, setData] = useState<QuestionRendererData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const queryInput = (parsedInput ?? null) as Record<string, unknown> | null;
  const extensions = useDynamicExtensionsStore(state => state.extensions);

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
            })
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
          const next = await getQuestionAnswerList(Number(queryInput?.questionId));
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
      return data.data.answers.map(answer => ({
        id: answer.id,
        content: answer.content,
        createTime: answer.createTime,
        updateTime: answer.updateTime,
      }));
    }

    if (data.kind === "question-answer-list") {
      return data.items.map(answer => ({
        id: answer.id,
        content: answer.content,
        createTime: answer.createTime,
        updateTime: answer.updateTime,
      }));
    }

    return [] as IAnswer[];
  }, [data]);

  const selectedAnswer = useMemo(
    () => answerItems.find(item => item.id === selectedAnswerId) ?? null,
    [answerItems, selectedAnswerId]
  );

  const handleAnswerChange = (nextAnswer: IAnswer) => {
    setData(prev => {
      if (!prev) {
        return prev;
      }
      if (prev.kind === "question-detail") {
        return {
          ...prev,
          data: {
            ...prev.data,
            answers: prev.data.answers.map(answer =>
              answer.id === nextAnswer.id
                ? {
                    ...answer,
                    content: nextAnswer.content,
                    preview: answer.preview,
                    markdown: answer.markdown,
                    updateTime: nextAnswer.updateTime,
                  }
                : answer
            ),
          },
        };
      }
      if (prev.kind === "question-answer-list") {
        return {
          ...prev,
          items: prev.items.map(answer =>
            answer.id === nextAnswer.id
              ? {
                  ...answer,
                  content: nextAnswer.content,
                  updateTime: nextAnswer.updateTime,
                }
              : answer
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
    return subscribeQuestionMutationEvent(event => {
      if (
        shouldRefreshQuestionResult({
          event,
          toolName: execution.toolName,
          parsedInput: queryInput,
          payloadKind: data.kind,
          payloadEntityType: "entityType" in data ? data.entityType : undefined,
          payloadId: "id" in data ? data.id : "questionId" in data ? data.questionId : null,
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
        <ToolCardHeader isDark={isDark}>
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
    item: QuestionQueryResult["items"][number] | QuestionDashboardResult["recentQuestions"][number]
  ) => (
    <ToolDividerListItem key={item.id}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="text-tau-body text-ink-1 min-w-0 flex-1 break-words font-medium">
          {item.questionContent}
        </div>
        <StatusBadge status={item.status} isDark={isDark} />
      </div>
      <ToolMutedText isDark={isDark} className="mt-0.5 break-words tabular-nums">
        {item.groupTitle ? `分组：${item.groupTitle}` : "未分组"} · 答案 {item.answerCount}
      </ToolMutedText>
      {item.descriptionPreview ? (
        <ToolMutedText isDark={isDark} className="text-ink-2 mt-1 break-words">
          {item.descriptionPreview}
        </ToolMutedText>
      ) : null}
    </ToolDividerListItem>
  );

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
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
        {data.kind === "question-query-result" ? (
          <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
            共 {data.summary.totalCount} 条，第 {data.summary.page} 页
          </ToolMutedText>
        ) : null}
      </ToolCardHeader>
      <ToolCardBody>
        {data.kind === "question-dashboard" ? (
          <>
            <div className="grid grid-cols-2 gap-1.5 tabular-nums">
              <ToolValuePill isDark={isDark}>总数：{data.summary.totalQuestions}</ToolValuePill>
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
            <ToolDividerList isDark={isDark}>
              {data.unresolvedQuestions.slice(0, 5).map(renderQuestionItem)}
            </ToolDividerList>
          </>
        ) : null}

        {data.kind === "question-group-query-result" ? (
          <ToolDividerList isDark={isDark}>
            {data.items.map(item => (
              <ToolDividerListItem key={item.id} isDark={isDark}>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="text-tau-body text-ink-1 min-w-0 truncate font-medium">
                    {item.title}
                  </div>
                  {item.isDefault ? <ToolBadge isDark={isDark}>默认</ToolBadge> : null}
                </div>
                <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
                  共 {item.totalCount} 题，已回答 {item.answeredCount}，未回答{" "}
                  {item.unansweredCount}
                </ToolMutedText>
              </ToolDividerListItem>
            ))}
          </ToolDividerList>
        ) : null}

        {data.kind === "question-query-result" ? (
          <ToolDividerList isDark={isDark}>{data.items.map(renderQuestionItem)}</ToolDividerList>
        ) : null}

        {data.kind === "question-group-detail" ? (
          <>
            <div className="flex flex-wrap gap-1.5 tabular-nums">
              <ToolValuePill isDark={isDark}>共 {data.data.totalCount} 题</ToolValuePill>
              <ToolValuePill isDark={isDark}>已回答 {data.data.answeredCount}</ToolValuePill>
              <ToolValuePill isDark={isDark}>未回答 {data.data.unansweredCount}</ToolValuePill>
            </div>
            <ToolDividerList isDark={isDark}>
              {data.data.questions.map(renderQuestionItem)}
            </ToolDividerList>
          </>
        ) : null}

        {data.kind === "question-detail" ? (
          <>
            <div className="space-y-1.5">
              <div className="text-tau-body text-ink-1 break-words font-medium">
                {data.data.questionContent}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={data.data.status} isDark={isDark} />
                {data.data.groupTitle ? (
                  <ToolBadge isDark={isDark}>{data.data.groupTitle}</ToolBadge>
                ) : null}
                <ToolBadge isDark={isDark}>答案 {data.data.answerCount}</ToolBadge>
              </div>
              {data.data.descriptionPreview ? (
                <ToolMutedText isDark={isDark} className="text-ink-2 break-words">
                  {data.data.descriptionPreview}
                </ToolMutedText>
              ) : null}
            </div>
            {data.data.answers.length ? (
              <AnswerCardList
                answers={answerItems}
                readOnly
                onViewAnswer={answerId => setSelectedAnswerId(answerId)}
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
                onViewAnswer={answerId => setSelectedAnswerId(answerId)}
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
