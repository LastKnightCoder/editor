import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolValuePill,
} from "./ui";

type QuestionOperationPayload = {
  kind?: string;
  success?: boolean;
  entityType?: "question-group" | "question" | "question-answer";
  action?: string;
  message?: string;
  data?: Record<string, unknown> | null;
};

const parsePayload = (output?: string): QuestionOperationPayload | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as QuestionOperationPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const entityLabelMap: Record<string, string> = {
  "question-group": "问题分组",
  question: "问题",
  "question-answer": "答案",
};

const actionLabelMap: Record<string, string> = {
  "create-group": "已创建问题分组",
  "update-group": "已更新问题分组",
  "delete-group": "已删除问题分组",
  "reorder-groups": "已重排问题分组",
  "create-question": "已创建问题",
  "update-question": "已更新问题",
  "delete-question": "已删除问题",
  "reorder-questions": "已重排问题",
  "move-question": "已移动问题",
  "update-question-status": "已更新问题状态",
  "create-answer": "已创建答案",
  "attach-answer": "已关联已有答案",
  "detach-answer": "已解除答案关联",
};

const getPrimaryText = (payload: QuestionOperationPayload) => {
  if (payload.success === false) {
    return "操作失败";
  }
  if (payload.action && actionLabelMap[payload.action]) {
    return actionLabelMap[payload.action];
  }
  return "操作已完成";
};

const getTitle = (payload: QuestionOperationPayload) => {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const question = data.question;
  if (question && typeof question === "object") {
    const title = (question as Record<string, unknown>).questionContent;
    if (typeof title === "string" && title.trim()) {
      return title.trim();
    }
  }

  const title = data.questionContent;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }

  const groupTitle = data.title;
  if (typeof groupTitle === "string" && groupTitle.trim()) {
    return groupTitle.trim();
  }

  return null;
};

const renderSummary = (payload: QuestionOperationPayload, isDark: boolean) => {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const topLevelStatus = data.status;
  const topLevelAnswers = data.answers;
  if (typeof topLevelStatus === "string" || Array.isArray(topLevelAnswers)) {
    return (
      <div className="flex flex-wrap gap-2">
        {typeof topLevelStatus === "string" ? (
          <ToolValuePill isDark={isDark}>状态：{topLevelStatus}</ToolValuePill>
        ) : null}
        {Array.isArray(topLevelAnswers) ? (
          <ToolValuePill isDark={isDark}>
            答案数：{topLevelAnswers.length}
          </ToolValuePill>
        ) : null}
      </div>
    );
  }

  const question = data.question;
  if (question && typeof question === "object") {
    const answerCount = (question as Record<string, unknown>).answers;
    const status = (question as Record<string, unknown>).status;
    return (
      <div className="flex flex-wrap gap-2">
        {typeof status === "string" ? (
          <ToolValuePill isDark={isDark}>状态：{status}</ToolValuePill>
        ) : null}
        {Array.isArray(answerCount) ? (
          <ToolValuePill isDark={isDark}>
            答案数：{answerCount.length}
          </ToolValuePill>
        ) : null}
      </div>
    );
  }

  const orderedIds = data.orderedIds;
  if (Array.isArray(orderedIds)) {
    return (
      <ToolValuePill isDark={isDark}>
        已更新 {orderedIds.length} 项顺序
      </ToolValuePill>
    );
  }

  const answerId = data.answerId;
  if (typeof answerId === "number") {
    return <ToolValuePill isDark={isDark}>答案 #{answerId}</ToolValuePill>;
  }

  return null;
};

const QuestionOperationRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const payload = parsePayload(execution.output);
  if (!payload || payload.kind !== "question-mutation-result") {
    return <>{renderDefault()}</>;
  }

  const title = getTitle(payload);
  const summary = renderSummary(payload, isDark);

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader
        isDark={isDark}
        divided={Boolean(title || payload.message || summary)}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            className={`min-w-0 flex-1 text-sm font-medium ${
              isDark ? "text-slate-100" : "text-slate-800"
            }`}
          >
            {getPrimaryText(payload)}
          </div>
          {payload.entityType ? (
            <ToolBadge isDark={isDark}>
              {entityLabelMap[payload.entityType] || payload.entityType}
            </ToolBadge>
          ) : null}
        </div>
      </ToolCardHeader>
      {title || payload.message || summary ? (
        <ToolCardBody>
          {title ? (
            <ToolMutedText isDark={isDark} className="break-words">
              对象：{title}
            </ToolMutedText>
          ) : null}
          {payload.message ? (
            <ToolMutedText isDark={isDark} className="break-words">
              {payload.message}
            </ToolMutedText>
          ) : null}
          {summary}
        </ToolCardBody>
      ) : null}
    </ToolCard>
  );
};

export default QuestionOperationRenderer;
