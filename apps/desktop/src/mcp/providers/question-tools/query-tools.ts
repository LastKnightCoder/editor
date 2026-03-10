import type { ToolDefinition } from "@/types";
import {
  getQuestionAnswerList,
  getQuestionDashboardData,
  getQuestionDetail,
  getQuestionGroupDetail,
  queryQuestionGroups,
  queryQuestions,
  type QuestionQueryRequest,
} from "@/mcp/question/query";
import { questionQuerySchema, toQueryResult } from "./shared";

export const buildQuestionQueryTools = (): ToolDefinition[] => [
  {
    name: "get_question_dashboard",
    description:
      "获取问题管理总览。返回问题总数、已回答数、未回答数、不同状态统计，以及最近更新和未解决的问题列表。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    executor: async () =>
      toQueryResult(await getQuestionDashboardData(), {
        layout: "detail",
        kind: "question-dashboard",
      }),
  },
  {
    name: "query_question_groups",
    description:
      "查询问题分组。支持按分组 ID、分组名称和是否包含默认分组筛选，适合在创建或移动问题前先定位目标分组。",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "number" } },
        names: { type: "array", items: { type: "string" } },
        includeDefault: { type: "boolean" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: [],
      additionalProperties: false,
    },
    executor: async (args) =>
      toQueryResult(
        await queryQuestionGroups({
          ids: args.ids as number[] | undefined,
          names: args.names as string[] | undefined,
          includeDefault: args.includeDefault as boolean | undefined,
          page: args.page as number | undefined,
          pageSize: args.pageSize as number | undefined,
        }),
        {
          layout: "list",
          entityType: "question-group",
        },
      ),
  },
  {
    name: "get_question_group_detail",
    description:
      "获取单个问题分组详情。返回分组统计和分组内的问题列表，适合在删除、重命名或批量整理前读取上下文。",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "number" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["groupId"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toQueryResult(
        await getQuestionGroupDetail({
          groupId: args.groupId as number,
          page: args.page as number | undefined,
          pageSize: args.pageSize as number | undefined,
        }),
        {
          layout: "detail",
          entityType: "question-group",
        },
      ),
  },
  {
    name: "query_questions",
    description:
      "查询问题。支持按问题 ID、分组 ID、分组名称、状态、是否有答案和关键字过滤，并支持分页和排序。",
    parameters: questionQuerySchema,
    executor: async (args) =>
      toQueryResult(await queryQuestions(args as QuestionQueryRequest), {
        layout: "list",
        entityType: "question",
      }),
  },
  {
    name: "get_question_detail",
    description:
      "获取单个问题详情。返回问题状态、所属分组、描述 Markdown 和关联答案摘要，适合在编辑或回答前读取完整上下文。",
    parameters: {
      type: "object",
      properties: {
        questionId: { type: "number" },
      },
      required: ["questionId"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toQueryResult(await getQuestionDetail(args.questionId as number), {
        layout: "detail",
        entityType: "question",
      }),
  },
  {
    name: "get_question_answers",
    description:
      "获取某个问题的答案列表。返回答案 Markdown 摘要，适合解释现有答案或在补充回答前检查上下文。",
    parameters: {
      type: "object",
      properties: {
        questionId: { type: "number" },
      },
      required: ["questionId"],
      additionalProperties: false,
    },
    executor: async (args) =>
      toQueryResult(await getQuestionAnswerList(args.questionId as number), {
        layout: "list",
        entityType: "question-answer",
      }),
  },
];
