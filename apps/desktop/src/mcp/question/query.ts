import type { Descendant } from "slate";
import {
  getAllQuestions,
  getQuestionAnswers,
  getQuestionById,
  getQuestionDetail as fetchQuestionDetail,
} from "@/commands/question";
import {
  getQuestionGroupStats,
  listQuestionGroups,
  type QuestionGroupDTO,
} from "@/commands/question-group";
import type { IAnswer, IQuestion, QuestionEvent, QuestionMaterial } from "@/types";
import { getMarkdown } from "@/utils/markdown-helper";

export interface QuestionDashboardResult {
  kind: "question-dashboard";
  summary: {
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: number;
    notStartedQuestions: number;
    inProgressQuestions: number;
    resolvedQuestions: number;
  };
  groups: QuestionGroupListItem[];
  recentQuestions: QuestionListItem[];
  unresolvedQuestions: QuestionListItem[];
}

export interface QuestionQueryResult {
  kind: "question-query-result";
  entityType: "question";
  summary: {
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  items: QuestionListItem[];
}

export interface QuestionGroupQueryResult {
  kind: "question-group-query-result";
  entityType: "question-group";
  summary: {
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  items: QuestionGroupListItem[];
}

export interface QuestionAnswerListResult {
  kind: "question-answer-list";
  entityType: "question-answer";
  questionId: number;
  questionTitle: string;
  summary: {
    totalCount: number;
  };
  items: QuestionAnswerListItem[];
}

export interface QuestionGroupListItem {
  id: number;
  title: string;
  color?: string;
  isDefault: boolean;
  totalCount: number;
  answeredCount: number;
  unansweredCount: number;
}

export interface QuestionListItem {
  id: number;
  questionContent: string;
  status: IQuestion["status"];
  groupId: number;
  groupTitle?: string;
  answerCount: number;
  createTime: number;
  updateTime: number;
  resolvedTime?: number | null;
  descriptionPreview: string;
}

export interface QuestionAnswerListItem {
  id: number;
  contentId: number;
  content: Descendant[];
  preview: string;
  markdown: string;
  createTime: number;
  updateTime: number;
}

export interface QuestionGroupDetailResult {
  kind: "question-group-detail";
  entityType: "question-group";
  id: number;
  data: QuestionGroupListItem & {
    questions: QuestionListItem[];
  };
}

export interface QuestionDetailResult {
  kind: "question-detail";
  entityType: "question";
  id: number;
  data: {
    id: number;
    questionContent: string;
    status: IQuestion["status"];
    groupId: number;
    groupTitle?: string;
    createTime: number;
    updateTime: number;
    resolvedTime?: number | null;
    answerCount: number;
    descriptionMarkdown: string;
    descriptionPreview: string;
    answers: QuestionAnswerListItem[];
    /** 全部探究材料（含项目、白板等没有 content 的材料） */
    materials: QuestionMaterialListItem[];
    /** 探究轨迹，按时间升序 */
    trajectory: QuestionTrajectoryItem[];
  };
}

export interface QuestionMaterialListItem {
  targetType: QuestionMaterial["targetType"];
  targetId: number;
  title: string;
  meta: string;
  missing: boolean;
}

export interface QuestionTrajectoryItem {
  type: QuestionEvent["type"];
  time: number;
  text: string;
}

const describeEvent = (event: QuestionEvent): string => {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "create":
      return "提出问题";
    case "status":
      return `状态变为 ${String(payload.to)}${payload.auto ? "（挂上第一份材料自动推进）" : ""}`;
    case "link":
      return `${payload.created ? "新建" : "关联"} ${String(payload.targetType)}：${String(payload.title ?? "")}`;
    case "unlink":
      return `移除 ${String(payload.targetType)}：${String(payload.title ?? "")}`;
    case "note":
      return String(payload.text ?? "");
  }
};

export interface QuestionQueryRequest {
  filter?: {
    questionIds?: number[];
    groupIds?: number[];
    groupTitles?: string[];
    statuses?: IQuestion["status"][];
    hasAnswers?: boolean;
    keyword?: string;
  };
  sort?: "manual" | "createTimeDesc" | "updateTimeDesc" | "resolvedTimeDesc";
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const normalizePage = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const toMarkdown = (content?: Descendant[]) => (content?.length ? getMarkdown(content).trim() : "");

const buildPreview = (markdown: string, maxLength = 120) => {
  const normalized = markdown.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const paginateItems = <T>(items: T[], page: number, pageSize: number) => {
  const startIndex = (page - 1) * pageSize;
  return items.slice(startIndex, startIndex + pageSize);
};

const buildStatsMap = (stats: Awaited<ReturnType<typeof getQuestionGroupStats>>) =>
  new Map(
    stats.map(item => [
      item.groupId,
      {
        totalCount: item.total,
        answeredCount: item.answered,
        unansweredCount: item.unanswered,
      },
    ])
  );

const buildGroupMap = (groups: QuestionGroupDTO[]) =>
  new Map(groups.map(group => [group.id, group]));

const toGroupListItem = (
  group: QuestionGroupDTO,
  statsMap: ReturnType<typeof buildStatsMap>
): QuestionGroupListItem => {
  const stats = statsMap.get(group.id);
  return {
    id: group.id,
    title: group.title,
    color: group.color,
    isDefault: group.isDefault,
    totalCount: stats?.totalCount ?? 0,
    answeredCount: stats?.answeredCount ?? 0,
    unansweredCount: stats?.unansweredCount ?? 0,
  };
};

const toQuestionListItem = (
  question: IQuestion,
  groupMap: ReturnType<typeof buildGroupMap>
): QuestionListItem => {
  const descriptionMarkdown = toMarkdown(question.description);
  return {
    id: question.id,
    questionContent: question.questionContent,
    status: question.status,
    groupId: question.groupId,
    groupTitle: groupMap.get(question.groupId)?.title,
    answerCount: question.answers.length,
    createTime: question.createTime,
    updateTime: question.updateTime,
    resolvedTime: question.resolvedTime,
    descriptionPreview: buildPreview(descriptionMarkdown),
  };
};

const toAnswerListItem = (answer: IAnswer): QuestionAnswerListItem => {
  const markdown = toMarkdown(answer.content);
  return {
    id: answer.id,
    contentId: answer.id,
    content: answer.content,
    preview: buildPreview(markdown),
    markdown,
    createTime: answer.createTime,
    updateTime: answer.updateTime,
  };
};

const sortQuestions = (
  questions: IQuestion[],
  groupMap: ReturnType<typeof buildGroupMap>,
  sort: QuestionQueryRequest["sort"]
) => {
  const next = [...questions];
  next.sort((left, right) => {
    switch (sort) {
      case "createTimeDesc":
        return right.createTime - left.createTime;
      case "updateTimeDesc":
        return right.updateTime - left.updateTime;
      case "resolvedTimeDesc": {
        const leftValue = left.resolvedTime ?? 0;
        const rightValue = right.resolvedTime ?? 0;
        if (leftValue !== rightValue) {
          return rightValue - leftValue;
        }
        return right.updateTime - left.updateTime;
      }
      case "manual":
      default: {
        const leftSort = groupMap.get(left.groupId)?.sortIndex ?? left.groupId;
        const rightSort = groupMap.get(right.groupId)?.sortIndex ?? right.groupId;
        if (leftSort !== rightSort) {
          return leftSort - rightSort;
        }
        if (left.sortIndex !== right.sortIndex) {
          return left.sortIndex - right.sortIndex;
        }
        return left.createTime - right.createTime;
      }
    }
  });
  return next;
};

export const getQuestionDashboardData = async (): Promise<QuestionDashboardResult> => {
  const [groups, stats, questions] = await Promise.all([
    listQuestionGroups(),
    getQuestionGroupStats(),
    getAllQuestions(),
  ]);

  const statsMap = buildStatsMap(stats);
  const groupMap = buildGroupMap(groups);
  const questionItems = questions.map(question => toQuestionListItem(question, groupMap));

  return {
    kind: "question-dashboard",
    summary: {
      totalQuestions: questions.length,
      answeredQuestions: questions.filter(item => item.answers.length > 0).length,
      unansweredQuestions: questions.filter(item => item.answers.length === 0).length,
      notStartedQuestions: questions.filter(item => item.status === "not_started").length,
      inProgressQuestions: questions.filter(item => item.status === "in_progress").length,
      resolvedQuestions: questions.filter(item => item.status === "resolved").length,
    },
    groups: groups.map(group => toGroupListItem(group, statsMap)),
    recentQuestions: [...questionItems]
      .sort((left, right) => right.updateTime - left.updateTime)
      .slice(0, 10),
    unresolvedQuestions: questionItems
      .filter(item => item.status !== "resolved")
      .sort((left, right) => right.updateTime - left.updateTime)
      .slice(0, 10),
  };
};

export const queryQuestionGroups = async (params: {
  ids?: number[];
  names?: string[];
  includeDefault?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<QuestionGroupQueryResult> => {
  const [groups, stats] = await Promise.all([listQuestionGroups(), getQuestionGroupStats()]);

  const page = normalizePage(params.page, DEFAULT_PAGE);
  const pageSize = Math.min(normalizePage(params.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const statsMap = buildStatsMap(stats);
  const nameSet = new Set((params.names || []).map(normalizeText));

  const filtered = groups.filter(group => {
    if (params.ids?.length && !params.ids.includes(group.id)) {
      return false;
    }
    if (params.includeDefault === false && group.isDefault) {
      return false;
    }
    if (nameSet.size > 0 && !nameSet.has(normalizeText(group.title))) {
      return false;
    }
    return true;
  });

  const items = paginateItems(filtered, page, pageSize).map(group =>
    toGroupListItem(group, statsMap)
  );

  return {
    kind: "question-group-query-result",
    entityType: "question-group",
    summary: {
      totalCount: filtered.length,
      page,
      pageSize,
      hasMore: page * pageSize < filtered.length,
    },
    items,
  };
};

export const queryQuestions = async (
  params: QuestionQueryRequest
): Promise<QuestionQueryResult> => {
  const [questions, groups] = await Promise.all([getAllQuestions(), listQuestionGroups()]);

  const groupMap = buildGroupMap(groups);
  const groupTitleSet = new Set((params.filter?.groupTitles || []).map(normalizeText));
  const keyword = params.filter?.keyword?.trim().toLowerCase() ?? "";
  const page = normalizePage(params.page, DEFAULT_PAGE);
  const pageSize = Math.min(normalizePage(params.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  const filtered = questions.filter(question => {
    if (params.filter?.questionIds?.length && !params.filter.questionIds.includes(question.id)) {
      return false;
    }
    if (params.filter?.groupIds?.length && !params.filter.groupIds.includes(question.groupId)) {
      return false;
    }
    if (groupTitleSet.size > 0) {
      const groupTitle = groupMap.get(question.groupId)?.title;
      if (!groupTitle || !groupTitleSet.has(normalizeText(groupTitle))) {
        return false;
      }
    }
    if (params.filter?.statuses?.length && !params.filter.statuses.includes(question.status)) {
      return false;
    }
    if (
      typeof params.filter?.hasAnswers === "boolean" &&
      question.answers.length > 0 !== params.filter.hasAnswers
    ) {
      return false;
    }
    if (keyword) {
      const descriptionPreview = buildPreview(toMarkdown(question.description));
      const groupTitle = groupMap.get(question.groupId)?.title?.toLowerCase() || "";
      const haystack = [
        question.questionContent.toLowerCase(),
        descriptionPreview.toLowerCase(),
        groupTitle,
      ].join(" ");
      if (!haystack.includes(keyword)) {
        return false;
      }
    }
    return true;
  });

  const sorted = sortQuestions(filtered, groupMap, params.sort);
  const items = paginateItems(sorted, page, pageSize).map(question =>
    toQuestionListItem(question, groupMap)
  );

  return {
    kind: "question-query-result",
    entityType: "question",
    summary: {
      totalCount: sorted.length,
      page,
      pageSize,
      hasMore: page * pageSize < sorted.length,
    },
    items,
  };
};

export const getQuestionGroupDetail = async (params: {
  groupId: number;
  page?: number;
  pageSize?: number;
}): Promise<QuestionGroupDetailResult | null> => {
  const [groups, stats, questions] = await Promise.all([
    listQuestionGroups(),
    getQuestionGroupStats(),
    getAllQuestions(),
  ]);

  const group = groups.find(item => item.id === params.groupId);
  if (!group) {
    return null;
  }

  const statsMap = buildStatsMap(stats);
  const groupMap = buildGroupMap(groups);
  const page = normalizePage(params.page, DEFAULT_PAGE);
  const pageSize = Math.min(normalizePage(params.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const sortedQuestions = sortQuestions(
    questions.filter(item => item.groupId === params.groupId),
    groupMap,
    "manual"
  );

  return {
    kind: "question-group-detail",
    entityType: "question-group",
    id: group.id,
    data: {
      ...toGroupListItem(group, statsMap),
      questions: paginateItems(sortedQuestions, page, pageSize).map(item =>
        toQuestionListItem(item, groupMap)
      ),
    },
  };
};

export const getQuestionDetail = async (
  questionId: number
): Promise<QuestionDetailResult | null> => {
  const [question, groups] = await Promise.all([getQuestionById(questionId), listQuestionGroups()]);

  if (!question) {
    return null;
  }

  const [answers, detail] = await Promise.all([
    getQuestionAnswers(questionId),
    fetchQuestionDetail(questionId),
  ]);
  const groupMap = buildGroupMap(groups);
  const descriptionMarkdown = toMarkdown(question.description);

  return {
    kind: "question-detail",
    entityType: "question",
    id: question.id,
    data: {
      id: question.id,
      questionContent: question.questionContent,
      status: question.status,
      groupId: question.groupId,
      groupTitle: groupMap.get(question.groupId)?.title,
      createTime: question.createTime,
      updateTime: question.updateTime,
      resolvedTime: question.resolvedTime,
      answerCount: question.answers.length,
      descriptionMarkdown,
      descriptionPreview: buildPreview(descriptionMarkdown),
      answers: answers.map(toAnswerListItem),
      materials: (detail?.materials ?? []).map(m => ({
        targetType: m.targetType,
        targetId: m.targetId,
        title: m.title,
        meta: m.meta,
        missing: m.missing,
      })),
      trajectory: (detail?.events ?? []).map(e => ({
        type: e.type,
        time: e.createTime,
        text: describeEvent(e),
      })),
    },
  };
};

export const getQuestionAnswerList = async (
  questionId: number
): Promise<QuestionAnswerListResult | null> => {
  const question = await getQuestionById(questionId);
  if (!question) {
    return null;
  }

  const answers = await getQuestionAnswers(questionId);
  return {
    kind: "question-answer-list",
    entityType: "question-answer",
    questionId: question.id,
    questionTitle: question.questionContent,
    summary: {
      totalCount: answers.length,
    },
    items: answers.map(toAnswerListItem),
  };
};
