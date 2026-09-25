import { invoke } from "@/electron";
import type {
  ActiveQuestionPreview,
  IAnswer,
  ICreateAnswer,
  IQuestion,
  QuestionDetail,
  QuestionEvent,
  QuestionLink,
  QuestionLinkTarget,
  QuestionSummary,
  QuestionTargetCandidate,
} from "@/types";
import { Descendant } from "slate";
import { emitQuestionMutation, QUESTION_MUTATION_ACTIONS } from "@/mcp/question/mutation";

interface QuestionMutationOptions {
  suppressMutationEvent?: boolean;
  mutationSource?: string;
}

export async function createQuestion(
  question: string,
  groupId: number,
  description: Descendant[],
  options?: QuestionMutationOptions
): Promise<IQuestion> {
  const created = await invoke<IQuestion>("question:create", question, groupId, description);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: created.id,
      questionId: created.id,
      groupId: created.groupId,
      action: QUESTION_MUTATION_ACTIONS.CREATE_QUESTION,
      changedFields: ["questionContent", "description", "groupId"],
    });
  }
  return created;
}

export async function updateQuestion(
  questionId: number,
  question: string,
  description?: Descendant[],
  options?: QuestionMutationOptions
): Promise<IQuestion> {
  // description 省略即保留原背景；不传末尾 undefined，避免 JSON 传输把它变成 null 而清空
  const updated =
    description === undefined
      ? await invoke<IQuestion>("question:update", questionId, question)
      : await invoke<IQuestion>("question:update", questionId, question, description);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: updated.id,
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION,
      changedFields: ["questionContent", "description"],
    });
  }
  return updated;
}

export async function deleteQuestion(
  id: number,
  options?: QuestionMutationOptions
): Promise<number> {
  const current = await getQuestionById(id);
  const result = await invoke<number>("question:delete", id);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: id,
      questionId: id,
      groupId: current?.groupId,
      action: QUESTION_MUTATION_ACTIONS.DELETE_QUESTION,
    });
  }
  return result;
}

export async function getQuestionById(id: number): Promise<IQuestion | null> {
  return invoke("question:get-question-by-id", id);
}

export async function getQuestionsByIds(ids: number[]): Promise<IQuestion[]> {
  return invoke("question:get-questions-by-ids", ids);
}

export async function getAllQuestions(): Promise<IQuestion[]> {
  return invoke("question:get-all-questions");
}

export async function createAnswer(content: Descendant[]): Promise<IAnswer> {
  return invoke("question:create-answer", content);
}

export async function addAnswer(
  questionId: number,
  answer: ICreateAnswer,
  incRefCount = false,
  options?: QuestionMutationOptions
): Promise<IQuestion> {
  const updated = await invoke<IQuestion>("question:add-answer", questionId, answer, incRefCount);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      entityId: answer.contentId,
      questionId: updated.id,
      groupId: updated.groupId,
      action: incRefCount
        ? QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER
        : QUESTION_MUTATION_ACTIONS.CREATE_ANSWER,
      changedFields: ["answers", "resolvedTime", "status"],
    });
  }
  return updated;
}

export async function updateAnswer(
  questionId: number,
  answers: number[],
  options?: QuestionMutationOptions
): Promise<IQuestion> {
  const updated = await invoke<IQuestion>("question:update-answer", questionId, answers);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER,
      changedFields: ["answers", "resolvedTime", "status"],
    });
  }
  return updated;
}

export async function deleteAnswer(
  questionId: number,
  answerId: number,
  options?: QuestionMutationOptions
): Promise<IQuestion> {
  const updated = await invoke<IQuestion>("question:delete-answer", questionId, answerId);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      entityId: answerId,
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.DETACH_ANSWER,
      changedFields: ["answers", "resolvedTime", "status"],
    });
  }
  return updated;
}

export async function getQuestionAnswers(questionId: number): Promise<IAnswer[]> {
  return invoke("question:get-question-answers", questionId);
}

export async function getNoAnswerQuestions(): Promise<IQuestion[]> {
  return invoke("question:get-no-answer-questions");
}

export async function listQuestionsByGroup(params: {
  groupId: number;
  filter?: "all" | "answered" | "unanswered" | "not_started" | "in_progress" | "resolved";
  search?: string;
}): Promise<IQuestion[]> {
  return invoke(
    "question:list-by-group",
    params.groupId,
    params.filter ?? "all",
    params.search ?? ""
  );
}

export async function reorderQuestions(
  orderedIds: number[],
  options?: QuestionMutationOptions
): Promise<number> {
  const firstQuestion = orderedIds.length > 0 ? await getQuestionById(orderedIds[0]) : null;
  const result = await invoke<number>("question:reorder", { orderedIds });
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      groupId: firstQuestion?.groupId,
      action: QUESTION_MUTATION_ACTIONS.REORDER_QUESTIONS,
      changedFields: ["sortIndex"],
    });
  }
  return result;
}

export async function moveQuestionToGroup(
  id: number,
  toGroupId: number,
  options?: QuestionMutationOptions
): Promise<IQuestion> {
  const current = await getQuestionById(id);
  const moved = await invoke<IQuestion>("question:move-to-group", { id, toGroupId });
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: moved.id,
      questionId: moved.id,
      groupId: moved.groupId,
      previousGroupId: current?.groupId,
      action: QUESTION_MUTATION_ACTIONS.MOVE_QUESTION,
      changedFields: ["groupId"],
    });
  }
  return moved;
}

export async function updateQuestionStatus(
  questionId: number,
  status: "not_started" | "in_progress" | "resolved",
  options?: QuestionMutationOptions & { revertEventId?: number }
): Promise<IQuestion & { eventId?: number }> {
  const updated = await invoke<IQuestion & { eventId?: number }>(
    "question:update-status",
    questionId,
    status,
    { revertEventId: options?.revertEventId }
  );
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: updated.id,
      questionId: updated.id,
      groupId: updated.groupId,
      action: QUESTION_MUTATION_ACTIONS.UPDATE_QUESTION_STATUS,
      changedFields: ["status"],
    });
  }
  return updated;
}

export async function getQuestionDetail(questionId: number): Promise<QuestionDetail | null> {
  return invoke("question:get-detail", questionId);
}

export async function listQuestionSummaries(): Promise<QuestionSummary[]> {
  return invoke("question:list-summaries");
}

export async function listActiveQuestions(limit = 5): Promise<ActiveQuestionPreview[]> {
  return invoke("question:list-active", limit);
}

export async function listQuestionsByTarget(target: QuestionLinkTarget): Promise<IQuestion[]> {
  return invoke("question:list-links-by-target", target);
}

/**
 * 关联材料。incRef：为已有卡片 / 文章 / 项目文档增加引用（关联已有、从问题里新建卡片都传 true）；
 * created：轨迹记为「写下 / 新建」而非「关联」。
 */
export async function linkQuestionTargets(
  questionId: number,
  targets: QuestionLinkTarget[],
  linkOptions: { incRef?: boolean; created?: boolean } = {},
  options?: QuestionMutationOptions
): Promise<QuestionLink[]> {
  const added = await invoke<QuestionLink[]>(
    "question:link-targets",
    questionId,
    targets,
    linkOptions
  );
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      questionId,
      action: QUESTION_MUTATION_ACTIONS.ATTACH_ANSWER,
      changedFields: ["answers", "status"],
    });
  }
  return added;
}

export async function unlinkQuestionTarget(
  questionId: number,
  target: QuestionLinkTarget,
  options?: QuestionMutationOptions
): Promise<number> {
  const removed = await invoke<number>("question:unlink-target", questionId, target);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question-answer",
      questionId,
      action: QUESTION_MUTATION_ACTIONS.DETACH_ANSWER,
      changedFields: ["answers"],
    });
  }
  return removed;
}

export async function reorderQuestionLinks(questionId: number, linkIds: number[]): Promise<number> {
  return invoke("question:reorder-links", questionId, linkIds);
}

export async function addQuestionNote(
  questionId: number,
  text: string,
  options?: QuestionMutationOptions
): Promise<QuestionEvent> {
  const event = await invoke<QuestionEvent>("question:add-note", questionId, text);
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: questionId,
      questionId,
      action: QUESTION_MUTATION_ACTIONS.ADD_NOTE,
      changedFields: ["events"],
    });
  }
  return event;
}

export async function deleteQuestionEvent(eventId: number): Promise<number> {
  return invoke("question:delete-event", eventId);
}

/** 快速收集：groupHint 为「#分组」名称（全名或前缀），找不到落默认分组 */
export async function captureQuestion(
  title: string,
  groupHint?: string | null,
  options?: QuestionMutationOptions
): Promise<{ question: IQuestion; groupId: number; groupTitle: string }> {
  const result = await invoke<{ question: IQuestion; groupId: number; groupTitle: string }>(
    "question:capture",
    title,
    groupHint ?? null
  );
  if (!options?.suppressMutationEvent) {
    emitQuestionMutation({
      source: options?.mutationSource || "question-command",
      entityType: "question",
      entityId: result.question.id,
      questionId: result.question.id,
      groupId: result.groupId,
      action: QUESTION_MUTATION_ACTIONS.CREATE_QUESTION,
      changedFields: ["questionContent", "groupId"],
    });
  }
  return result;
}

export async function searchQuestionTargets(params: {
  questionId: number;
  targetType: Exclude<QuestionLinkTarget["targetType"], "answer">;
  keyword?: string;
  limit?: number;
}): Promise<QuestionTargetCandidate[]> {
  return invoke("question:search-targets", params);
}
