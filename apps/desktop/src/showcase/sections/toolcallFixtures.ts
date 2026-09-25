/**
 * 对话工具渲染档案的展品 fixture —— 逐字段对照真实工具的输出构造（多数解析器只认
 * 判别键，但渲染组件直接读其余字段，数据必须给全）。全部渲染器都是 execution 进、
 * UI 出的纯展示：不 mock 任何 IPC；唯一预置的是内容编辑「待确认」审阅会话与已应用
 * proposal（交互态本就住在本地 store，属于给组件初值，不是造假后端）。
 */

import type { ToolCallExecutionState } from "@tau/shared";
import {
  useContentEditReviewSessionStore,
  useContentEditReviewStore,
  type ContentEditRendererPayload,
} from "@/services/content-editing";

/** 展品锚定加载时刻：所有相对量（逾期 / 未来 / x 天前）由它派生，跨机器时钟稳定 */
const NOW = Date.now();
const DAY = 86_400_000;
const MIN = 60_000;

/** 日历事件的 "YYYY-MM-DD" 展示串（同为派生量，与其它展品时间口径一致） */
const isoDate = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

const json = JSON.stringify;

/* ────────────────────────── 缺省折叠行（ToolCallRow） ────────────────────────── */

export const rowPending: ToolCallExecutionState = {
  toolCallId: "fx-row-pending",
  toolName: "read_file",
  status: "pending",
  input: json({ path: "docs/redesign/03-架构实现指南.md" }),
  timestamp: NOW,
};

export const rowExecuting: ToolCallExecutionState = {
  toolCallId: "fx-row-executing",
  toolName: "grep_search",
  status: "executing",
  input: json({ pattern: "definePage", include: "*.tsx" }),
  timestamp: NOW,
};

export const rowRetrying: ToolCallExecutionState = {
  toolCallId: "fx-row-retrying",
  toolName: "web_fetch",
  status: "retrying",
  input: json({ url: "https://api.example.com/v1/stats" }),
  error: "请求超时（30 秒未响应）",
  retryCount: 1,
  timestamp: NOW,
};

export const rowSuccess: ToolCallExecutionState = {
  toolCallId: "fx-row-success",
  toolName: "list_directory",
  status: "success",
  input: json({ path: "src/app" }),
  output: "AppShell.tsx\nTitlebar.tsx\nnavigation.ts\nnavSlots.tsx\nshellStore.ts",
  duration: 96,
  timestamp: NOW,
};

export const rowFailedExec: ToolCallExecutionState = {
  toolCallId: "fx-row-failed-exec",
  toolName: "run_command",
  status: "failed",
  input: json({ command: "pnpm build" }),
  error: "Command failed with exit code 1\nELIFECYCLE  Command failed with exit code 1.",
  errorType: "execution",
  duration: 12_400,
  retryCount: 2,
  timestamp: NOW,
};

export const rowFailedParam: ToolCallExecutionState = {
  toolCallId: "fx-row-failed-param",
  toolName: "read_file",
  status: "failed",
  input: json({}),
  error: "参数校验失败：path 不能为空",
  errorType: "parameter",
  timestamp: NOW,
};

export const rowCancelled: ToolCallExecutionState = {
  toolCallId: "fx-row-cancelled",
  toolName: "web_search",
  status: "cancelled",
  input: json({ query: "tau design system" }),
  timestamp: NOW,
};

/* ────────────────────────── 任务与日历 ────────────────────────── */

const todoGroup = (id: number, title: string, color: string) => ({
  id,
  title,
  color,
  sortIndex: id,
  isArchived: false,
  isSystem: false,
  systemType: null,
  createTime: NOW - 9 * DAY,
  updateTime: NOW - 9 * DAY,
});

const workGroup = todoGroup(2, "工作", "#3b82f6");
const personalGroup = todoGroup(1, "个人", "#22c55e");

const todoItems = [
  {
    id: 1,
    groupId: 2,
    parentId: null,
    title: "完成编辑器重构方案",
    type: "deadline",
    isCompleted: false,
    dueAt: NOW - 2 * DAY,
    startAt: null,
    remindBefore: null,
    completedAt: null,
    sortIndex: 0,
    isArchived: false,
    createTime: NOW - 5 * DAY,
    updateTime: NOW - 3 * 60 * 60 * 1000,
    group: workGroup,
    noteCount: 2,
    notes: [],
    recurrence: null,
    recurrenceCompletions: [],
    calendarMappings: [],
    descriptionMarkdown: "拆分为三个里程碑，本周五前给结论",
    descriptionContentId: null,
    descriptionContent: [],
  },
  {
    id: 2,
    groupId: 2,
    parentId: 1,
    title: "评审数据库迁移脚本",
    type: "normal",
    isCompleted: false,
    dueAt: NOW + 3 * DAY,
    startAt: null,
    remindBefore: null,
    completedAt: null,
    sortIndex: 1,
    isArchived: false,
    createTime: NOW - 4 * DAY,
    updateTime: NOW - DAY,
    group: workGroup,
    noteCount: 0,
    notes: [],
    recurrence: null,
    recurrenceCompletions: [],
    calendarMappings: [],
    descriptionMarkdown: "",
    descriptionContentId: null,
    descriptionContent: [],
  },
  {
    id: 3,
    groupId: 1,
    parentId: null,
    title: "整理桌面文件",
    type: "normal",
    isCompleted: true,
    dueAt: null,
    startAt: null,
    remindBefore: null,
    completedAt: NOW - 14 * 60 * 60 * 1000,
    sortIndex: 0,
    isArchived: false,
    createTime: NOW - 12 * DAY,
    updateTime: NOW - 14 * 60 * 60 * 1000,
    group: personalGroup,
    noteCount: 0,
    notes: [],
    recurrence: null,
    recurrenceCompletions: [],
    calendarMappings: [],
    descriptionMarkdown: "",
    descriptionContentId: null,
    descriptionContent: [],
  },
  {
    id: 4,
    groupId: 1,
    parentId: null,
    title: "每天背 20 个单词",
    type: "recurring",
    isCompleted: false,
    dueAt: null,
    startAt: null,
    remindBefore: null,
    completedAt: null,
    sortIndex: 1,
    isArchived: false,
    createTime: NOW - 30 * DAY,
    updateTime: NOW - 6 * 60 * 60 * 1000,
    group: personalGroup,
    noteCount: 0,
    notes: [],
    recurrence: {
      id: 9,
      todoItemId: 4,
      type: "daily",
      interval: 1,
      weekdays: null,
      monthDay: null,
      yearMonth: null,
      yearDay: null,
      excludeHolidays: false,
      startDate: NOW - 30 * DAY,
      endDate: null,
      maxOccurrences: null,
      createTime: NOW - 30 * DAY,
      updateTime: NOW - 30 * DAY,
    },
    recurrenceCompletions: [],
    calendarMappings: [
      {
        id: 5,
        todoItemId: 4,
        calendarEventId: 103,
        syncType: "recurring",
        recurrenceDate: NOW - DAY,
        createTime: NOW - 30 * DAY,
      },
    ],
    descriptionMarkdown: "",
    descriptionContentId: null,
    descriptionContent: [],
  },
];

export const todoQuery: ToolCallExecutionState = {
  toolCallId: "fx-todo-query",
  toolName: "query_todos",
  status: "success",
  input: json({
    filter: { systemGroupTypes: ["all"] },
    groupBy: "group",
    sort: "dueAtAsc",
    page: 1,
    pageSize: 50,
  }),
  output: json({
    type: "todo-query-result",
    query: {
      filter: { systemGroupTypes: ["all"] },
      groupBy: "group",
      sort: "dueAtAsc",
      page: 1,
      pageSize: 50,
    },
    summary: {
      totalCount: 4,
      completedCount: 1,
      pendingCount: 3,
      overdueCount: 1,
      groupsCount: 2,
      recentCompleted: [
        {
          id: 3,
          title: "整理桌面文件",
          groupId: 1,
          groupTitle: "个人",
          completedAt: NOW - 14 * 60 * 60 * 1000,
        },
      ],
    },
    items: todoItems,
    groups: [
      { key: "group:2", label: "工作", itemIds: [1, 2], totalCount: 2 },
      { key: "group:1", label: "个人", itemIds: [3, 4], totalCount: 2 },
    ],
    page: 1,
    pageSize: 50,
    total: 4,
    totalPages: 1,
    render: { layout: "todo-list", groupBy: "group", sort: "dueAtAsc" },
  }),
  duration: 412,
  timestamp: NOW,
};

export const todoDashboard: ToolCallExecutionState = {
  toolCallId: "fx-todo-dashboard",
  toolName: "get_todo_dashboard",
  status: "success",
  input: "",
  output: json({
    type: "todo-dashboard",
    generatedAt: NOW - 45_000,
    summary: {
      totalCount: 12,
      completedCount: 5,
      pendingCount: 7,
      overdueCount: 2,
      groupsCount: 3,
      recentCompleted: [],
    },
    items: todoItems,
    groupBuckets: [
      { key: "group:2", label: "工作", itemIds: [1, 2], totalCount: 7 },
      { key: "group:1", label: "个人", itemIds: [3, 4], totalCount: 5 },
    ],
    overdueItems: [],
    pendingItems: [],
    recentCompletedItems: [],
    groups: [
      { id: 2, title: "工作", color: "#3b82f6", total: 7, pending: 5, overdue: 1 },
      { id: 1, title: "个人", color: "#22c55e", total: 5, pending: 2, overdue: 1 },
    ],
  }),
  duration: 388,
  timestamp: NOW,
};

export const todoCreate: ToolCallExecutionState = {
  toolCallId: "fx-todo-create",
  toolName: "create_todo",
  status: "success",
  input: json({ groupId: 3, title: "准备周会汇报材料", type: "normal", dueAt: NOW + 2 * DAY }),
  output: json({
    success: true,
    todoId: 12,
    event: {
      action: "create-item",
      entityType: "item",
      entityId: 12,
      groupId: 3,
      relatedItemId: null,
    },
    data: { title: "准备周会汇报材料", groupTitle: "工作" },
  }),
  duration: 156,
  timestamp: NOW,
};

export const calendarEvents: ToolCallExecutionState = {
  toolCallId: "fx-calendar-events",
  toolName: "query_calendar_events",
  status: "success",
  input: json({ startDate: isoDate(0), endDate: isoDate(14) }),
  output: json({
    kind: "calendar-query-result",
    entityType: "calendar-event",
    summary: { totalCount: 3, page: 1, pageSize: 20, hasMore: false },
    items: [
      {
        id: 101,
        title: "产品评审会",
        calendarId: 1,
        calendarTitle: "工作日历",
        color: "#3b82f6",
        startDate: isoDate(3),
        endDate: null,
        startTime: 540,
        endTime: 600,
        allDay: false,
        value: null,
        detailPreview: "评审 Q3 编辑器重构方案，确认上线排期",
      },
      {
        id: 102,
        title: "国庆假期",
        calendarId: 2,
        calendarTitle: "节假日",
        color: "#ef4444",
        startDate: isoDate(6),
        endDate: isoDate(12),
        startTime: null,
        endTime: null,
        allDay: true,
        value: null,
      },
      {
        id: 103,
        title: "牙医复诊",
        calendarId: 3,
        calendarTitle: "生活",
        color: "#22c55e",
        startDate: isoDate(10),
        endDate: null,
        startTime: 600,
        endTime: 630,
        allDay: false,
        value: null,
      },
    ],
  }),
  duration: 335,
  timestamp: NOW,
};

export const calendarCreate: ToolCallExecutionState = {
  toolCallId: "fx-calendar-create",
  toolName: "create_calendar_event",
  status: "success",
  input: json({
    calendarTitle: "工作日历",
    title: "产品评审会",
    startDate: isoDate(3),
    startTime: 540,
    endTime: 600,
    detail: "评审 Q3 编辑器重构方案，确认上线排期",
  }),
  output: json({
    kind: "calendar-mutation-result",
    success: true,
    entityType: "calendar-event",
    action: "create-event",
    message: "已在「工作日历」创建 1 个日程",
    data: { title: "产品评审会", calendarTitle: "工作日历" },
    event: { entityId: 101, calendarId: 1, groupId: 1 },
  }),
  duration: 218,
  timestamp: NOW,
};

/* ────────────────────────── 问题与知识 ────────────────────────── */

const questionItems = [
  {
    id: 12,
    questionContent: "向量数据库的索引机制该选 HNSW 还是 IVF？",
    status: "in_progress",
    groupId: 3,
    groupTitle: "技术调研",
    answerCount: 2,
    createTime: NOW - 30 * DAY,
    updateTime: NOW - 2 * DAY,
    resolvedTime: null,
    descriptionPreview: "想对比百万级向量下召回率与写入延迟的权衡。",
  },
  {
    id: 15,
    questionContent: "如何设计多端同步的冲突解决策略？",
    status: "not_started",
    groupId: 3,
    groupTitle: "技术调研",
    answerCount: 0,
    createTime: NOW - 5 * DAY,
    updateTime: NOW - 5 * DAY,
    resolvedTime: null,
    descriptionPreview: "",
  },
  {
    id: 18,
    questionContent: "为什么项目周会总是开不长？",
    status: "resolved",
    groupId: 0,
    groupTitle: "默认分组",
    answerCount: 3,
    createTime: NOW - 60 * DAY,
    updateTime: NOW - 14 * DAY,
    resolvedTime: NOW - 14 * DAY,
    descriptionPreview: "已经沉淀了一页会议纪要模板。",
  },
];

export const questionQuery: ToolCallExecutionState = {
  toolCallId: "fx-question-query",
  toolName: "query_questions",
  status: "success",
  input: json({ filter: { groupIds: [3] }, sort: "updateTimeDesc", page: 1, pageSize: 20 }),
  output: json({
    kind: "question-query-result",
    entityType: "question",
    summary: { totalCount: 3, page: 1, pageSize: 20, hasMore: false },
    items: questionItems,
  }),
  metadata: { render: { rendererKey: "question-query", version: 1 } },
  duration: 291,
  timestamp: NOW,
};

export const questionMutation: ToolCallExecutionState = {
  toolCallId: "fx-question-mutation",
  toolName: "update_question_status",
  status: "success",
  input: json({ questionId: 12, status: "in_progress" }),
  output: json({
    kind: "question-mutation-result",
    success: true,
    entityType: "question",
    action: "update-question-status",
    message: "已将问题标记为「进行中」",
    data: {
      id: 12,
      questionContent: "向量数据库的索引机制该选 HNSW 还是 IVF？",
      status: "in_progress",
      groupId: 3,
      answers: [101, 102],
      updateTime: NOW,
    },
  }),
  metadata: { render: { rendererKey: "question-mutation", version: 1 } },
  duration: 133,
  timestamp: NOW,
};

export const knowledgeSearch: ToolCallExecutionState = {
  toolCallId: "fx-knowledge-search",
  toolName: "search_knowledge",
  status: "success",
  input: json({ query: "HNSW 索引调优", limit: 5 }),
  output: json({
    success: true,
    count: 3,
    results: [
      {
        id: 88,
        contentId: 90001,
        type: "card",
        typeName: "卡片",
        title: "HNSW 参数调优笔记",
        content:
          "efConstruction 越大，召回率越高但构建越慢；M 控制图的出度，通常取 16-48。\n笔记里记录了不同数据规模下的实测召回率对比。",
        updateTime: NOW - 2 * DAY,
        source: "本地索引",
      },
      {
        id: 91,
        contentId: 90002,
        type: "article",
        typeName: "文章",
        title: "向量检索入门：从暴力搜索到图索引",
        content:
          "暴力搜索在小规模下依然是最优解；图索引（HNSW）赢在百万级以上的低延迟查询。\nIVF 通过聚类把候选集缩小一个数量级，代价是召回率对 nprobe 敏感。\n选型的第一步永远是量化写入吞吐与查询延迟的预算。",
        updateTime: NOW - 15 * DAY,
        source: "本地索引",
        date: isoDate(-15),
      },
      {
        id: 95,
        contentId: 90003,
        type: "project_item",
        typeName: "项目文档",
        title: "选型结论：先用 IVF，量级上来再切 HNSW",
        content:
          "当前库量级 40 万，IVF + nprobe=32 已满足 50ms P99；迁移到 HNSW 的触发条件是量级过 500 万。",
        updateTime: NOW - 40 * DAY,
        source: "本地索引",
      },
    ],
  }),
  duration: 1740,
  timestamp: NOW,
};

/* ────────────────────────── 结构化结果与内容编辑 ────────────────────────── */

export const structuredResult: ToolCallExecutionState = {
  toolCallId: "fx-structured",
  toolName: "maintenance_check",
  status: "success",
  input: json({ scope: "full" }),
  output: json({ ok: true }),
  metadata: {
    render: {
      rendererKey: "structured-tool-result",
      version: 1,
      payload: {
        layout: "list",
        title: "本地知识库索引体检",
        subtitle: "对当前数据库全部内容做了一次索引健康检查",
        status: "完成",
        badges: ["全库", "增量"],
        metrics: [
          { label: "已索引文档", value: 128 },
          { label: "耗时", value: "42 秒" },
        ],
        fields: [
          { label: "数据库", value: "个人笔记库" },
          { label: "上次失败项", value: null },
        ],
        items: [
          {
            title: "3 篇文档缺少嵌入向量",
            subtitle: "疑似在索引过程中被移动",
            description: "已重新排队，将在下一次空闲窗口补齐。",
            badges: ["待修复"],
          },
          {
            title: "2 条过期索引已清理",
            description: "对应内容在回收站中被彻底删除。",
            badges: ["已处理"],
          },
        ],
        emptyText: "本次检查没有发现异常。",
      },
    },
  },
  duration: 42_300,
  timestamp: NOW,
};

const EDIT_BEFORE_MARKDOWN = [
  "# HNSW 参数调优笔记",
  "",
  "efConstruction 越大，召回率越高但构建越慢；M 控制图的出度，通常取 16-48。",
  "",
  "搜索时 efSearch 与 k 的比例需要按召回目标调整。",
].join("\n");

const EDIT_AFTER_MARKDOWN = [
  "# HNSW 参数调优笔记",
  "",
  "efConstruction 越大，召回率越高但构建越慢；M 控制图的最大出度，通常取 16-48，写入密集场景建议取下限。",
  "",
  "搜索时 efSearch 与 k 的比例需要按召回目标调整（通常从 10 倍起步再做二分）。",
].join("\n");

const editPatches = [
  {
    operationId: "op-1",
    op: "replace",
    start: 44,
    end: 62,
    beforeText: "M 控制图的出度，通常取 16-48。",
    afterText: "M 控制图的最大出度，通常取 16-48，写入密集场景建议取下限。",
    charDelta: 14,
  },
  {
    operationId: "op-2",
    op: "insert",
    start: 93,
    end: 93,
    beforeText: "",
    afterText: "（通常从 10 倍起步再做二分）",
    charDelta: 14,
  },
] satisfies ContentEditRendererPayload["patches"];

const editDiffSummary = {
  patchCount: 2,
  insertedChars: 28,
  deletedChars: 0,
  changePreviews: [
    {
      operationId: "op-1",
      op: "replace",
      beforeTextPreview: "M 控制图的出度，通常取 16-48。",
      afterTextPreview: "M 控制图的最大出度，通常取 16-48，写入密集场景建议取下限。",
      charDelta: 14,
    },
    {
      operationId: "op-2",
      op: "insert",
      beforeTextPreview: "",
      afterTextPreview: "（通常从 10 倍起步再做二分）",
      charDelta: 14,
    },
  ],
} satisfies ContentEditRendererPayload["diffSummary"];

/** 「待确认」标本：执行中的 replace_content_by_text + 预置 pending 审阅会话 */
export const contentEditPending: ToolCallExecutionState = {
  toolCallId: "fx-edit-pending",
  toolName: "replace_content_by_text",
  status: "executing",
  input: json({ toolName: "replace_content_by_text", proposalId: "proposal_showcase_pending" }),
  timestamp: NOW - MIN,
};

{
  const payload: ContentEditRendererPayload = {
    kind: "content-edit-proposal",
    proposalId: "proposal_showcase_pending",
    conversationKey: "content-edit:1024",
    contentId: 1024,
    sourceToolName: "replace_content_by_text",
    status: "pending_review",
    beforeHash: "fx-before",
    afterHash: "fx-after",
    snapshotId: "",
    diffSummary: editDiffSummary,
    patches: editPatches,
    currentPermission: "review_required",
    targetSource: "active-session",
    createdAt: NOW - MIN,
    updatedAt: NOW - MIN,
    beforeMarkdown: EDIT_BEFORE_MARKDOWN,
    proposedMarkdown: EDIT_AFTER_MARKDOWN,
  };
  useContentEditReviewSessionStore.getState().createPending({
    toolCallId: contentEditPending.toolCallId,
    toolName: contentEditPending.toolName,
    conversationKey: payload.conversationKey,
    rawInput: contentEditPending.input,
    proposalId: payload.proposalId,
    payload,
  });
}

/** 「已应用」标本：成功的 apply_content_edit_operations + 审阅结果回执 */
export const contentEditApplied: ToolCallExecutionState = {
  toolCallId: "fx-edit-applied",
  toolName: "apply_content_edit_operations",
  status: "success",
  input: json({ contentId: 1024, operations: 2 }),
  output: json({
    kind: "content-edit-review-result",
    type: "content-edit-review-result",
    action: "applied",
    submittedAt: NOW - 30 * MIN,
    contentId: 1024,
    proposalId: "proposal_showcase_applied",
    conversationKey: "content-edit:1024",
    message: "用户已确认应用修改",
    proposal: {
      sourceToolName: "replace_content_by_text",
      proposedMarkdown: EDIT_AFTER_MARKDOWN,
      diffSummary: editDiffSummary,
      patches: editPatches,
    },
  }),
  duration: 214,
  timestamp: NOW - 30 * MIN,
};

// 改动高亮视图需要前文 markdown，经 proposal 记录补齐（不设 checkpointId，
// 避免样板间出现会触发 IPC 的「撤销」按钮）
useContentEditReviewStore.getState().upsertProposal({
  proposalId: "proposal_showcase_applied",
  conversationKey: "content-edit:1024",
  contentId: 1024,
  sourceToolName: "replace_content_by_text",
  status: "applied",
  beforeMarkdown: EDIT_BEFORE_MARKDOWN,
  beforeHash: "fx-before",
  afterHash: "fx-after",
  snapshotId: "",
  snapshotSource: "database",
  targetSource: "active-session",
  proposalFilePath: "showcase://content-edit/applied",
  diffSummary: editDiffSummary,
  patches: editPatches,
  createdAt: NOW - 90 * MIN,
  updatedAt: NOW - 30 * MIN,
  feedbackHistory: [],
});

/* ────────────────────────── 对话交互与执行 ────────────────────────── */

export const askQuestionForm: ToolCallExecutionState = {
  toolCallId: "fx-ask-form",
  toolName: "ask-question",
  status: "executing",
  input: json({
    title: "确认重构方案",
    description: "请选择目标分支与回归测试范围",
    submitLabel: "提交选择",
    questions: [
      {
        id: "q-branch",
        question: "本次重构合入哪个分支？",
        type: "single",
        required: true,
        options: [
          { label: "主干 master", value: "master", description: "直接合入主线" },
          { label: "功能分支", value: "feature/desktop-refactor", description: "先攒一轮再合" },
        ],
      },
      {
        id: "q-scope",
        question: "回归测试需要覆盖哪些范围？",
        type: "multiple",
        required: false,
        options: [
          { label: "单元测试", value: "unit" },
          { label: "端到端测试", value: "e2e", description: "包含打包验证" },
          { label: "手工冒烟", value: "smoke" },
        ],
      },
    ],
  }),
  timestamp: NOW,
};

export const askQuestionSubmitted: ToolCallExecutionState = {
  toolCallId: "fx-ask-submitted",
  toolName: "ask-question",
  status: "success",
  input: askQuestionForm.input,
  output: json({
    type: "ask-question-result",
    submittedAt: NOW + 45_000,
    answers: [
      {
        questionId: "q-branch",
        question: "本次重构合入哪个分支？",
        type: "single",
        required: true,
        selectedOptions: [{ value: "feature/desktop-refactor", label: "功能分支" }],
        otherText: "",
      },
      {
        questionId: "q-scope",
        question: "回归测试需要覆盖哪些范围？",
        type: "multiple",
        required: false,
        selectedOptions: [
          { value: "unit", label: "单元测试" },
          { value: "e2e", label: "端到端测试" },
        ],
        otherText: "补一轮打包安装的冒烟",
      },
    ],
  }),
  duration: 47_000,
  timestamp: NOW,
};

const imageFiles = [
  {
    url: "https://picsum.photos/seed/tau-city-night/1024/1024",
    mimeType: "image/png",
    fileName: "openai-image-1.png",
    revisedPrompt: "霓虹灯下的未来城市，雨天，高对比",
  },
  {
    url: "https://picsum.photos/seed/tau-city-day/1024/1024",
    mimeType: "image/png",
    fileName: "openai-image-2.png",
  },
];

const imagePayload = {
  success: true,
  mode: "generate",
  prompt: "一张赛博朋克风格的城市夜景插画",
  images: imageFiles,
  parameters: { size: "1024x1024", n: 2 },
};

export const imageGeneration: ToolCallExecutionState = {
  toolCallId: "fx-image",
  toolName: "generate_image",
  status: "success",
  input: json({ prompt: "一张赛博朋克风格的城市夜景插画", size: "1024x1024", n: 2 }),
  output: json(imagePayload, null, 2),
  metadata: { render: { rendererKey: "openai-image-result", payload: imagePayload } },
  duration: 8120,
  timestamp: NOW,
};

export const subagentResearch: ToolCallExecutionState = {
  toolCallId: "fx-subagent",
  toolName: "subagent_research",
  status: "success",
  input: json({
    tasks: [
      { id: "task-1", title: "调研竞品定价", prompt: "对比三款竞品的订阅定价并总结。" },
      { id: "task-2", title: "整理用户反馈", prompt: "汇总近 30 天用户反馈中的高频痛点。" },
    ],
    context: "产品为桌面端 AI 编辑器",
    maxConcurrency: 2,
  }),
  output: "SubAgent 调研结束：1 个任务成功，1 个任务失败。",
  metadata: {
    render: {
      rendererKey: "subagent-research",
      payload: {
        sessionId: "fx-subagent",
        status: "partial_success",
        summary: "完成 1 个任务，失败 1 个任务。",
        startedAt: NOW - 2 * MIN,
        finishedAt: NOW,
        tasks: [
          {
            id: "task-1",
            title: "调研竞品定价",
            prompt: "对比三款竞品的订阅定价并总结。",
            status: "success",
            startedAt: NOW - 2 * MIN,
            duration: 95_000,
            events: [
              { time: NOW - 2 * MIN, type: "started", message: "开始调研" },
              { time: NOW - 25_000, type: "finished", message: "调研完成" },
            ],
            toolExecutions: [
              {
                toolCallId: "fx-sub-web-1",
                toolName: "web_search",
                source: "mcp",
                status: "success",
                input: json({ query: "AI 编辑器 订阅定价 2026" }),
                output: "共 8 条结果",
                timestamp: NOW - 118_000,
                duration: 1200,
              },
              {
                toolCallId: "fx-sub-web-2",
                toolName: "web_fetch",
                source: "mcp",
                status: "success",
                input: json({ url: "https://competitor.example.com/pricing" }),
                output: "定价页快照已提取",
                timestamp: NOW - 116_000,
                duration: 890,
              },
            ],
            reasoning: "先看官网定价页，再对比年付折扣。",
            answer: "三款竞品定价区间为每月 10-20 美元，年付普遍打 8 折；旗舰档都含 AI 额度包。",
          },
          {
            id: "task-2",
            title: "整理用户反馈",
            prompt: "汇总近 30 天用户反馈中的高频痛点。",
            status: "failed",
            startedAt: NOW - 119_000,
            duration: 118_000,
            events: [
              { time: NOW - 119_000, type: "started", message: "开始调研" },
              { time: NOW - 1000, type: "failed", message: "反馈数据源连接超时" },
            ],
            toolExecutions: [],
            error: "反馈数据源连接超时",
          },
        ],
      },
    },
  },
  duration: 120_000,
  timestamp: NOW - 2 * MIN,
};
