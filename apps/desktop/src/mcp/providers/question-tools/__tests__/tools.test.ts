import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/question", () => ({
  createAnswer: vi.fn(),
  addAnswer: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  getQuestionById: vi.fn(),
  deleteAnswer: vi.fn(),
  deleteQuestion: vi.fn(),
  moveQuestionToGroup: vi.fn(),
  reorderQuestions: vi.fn(),
  updateQuestionStatus: vi.fn(),
}));

vi.mock("@/commands/question-group", () => ({
  getDefaultQuestionGroup: vi.fn(),
  listQuestionGroups: vi.fn(),
  createQuestionGroup: vi.fn(),
  updateQuestionGroup: vi.fn(),
  deleteQuestionGroup: vi.fn(),
  reorderQuestionGroups: vi.fn(),
}));

vi.mock("@/utils/markdown", () => ({
  importFromMarkdown: vi.fn(),
}));

vi.mock("@/mcp/question/query", () => ({
  getQuestionDashboardData: vi.fn(),
  queryQuestionGroups: vi.fn(),
  getQuestionGroupDetail: vi.fn(),
  queryQuestions: vi.fn(),
  getQuestionDetail: vi.fn(),
  getQuestionAnswerList: vi.fn(),
}));

import * as questionCommands from "@/commands/question";
import { getQuestionDetail } from "@/mcp/question/query";
import { importFromMarkdown } from "@/utils/markdown";
import { buildQuestionItemTools } from "../item-tools";
import { buildQuestionQueryTools } from "../query-tools";

const findTool = <T extends { name: string }>(tools: T[], name: string) => {
  const tool = tools.find((entry) => entry.name === name);
  expect(tool).toBeTruthy();
  return tool!;
};

describe("question MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create_question_answer_from_markdown 应使用 importFromMarkdown 并返回 question-mutation metadata", async () => {
    vi.mocked(importFromMarkdown).mockReturnValue([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "答案内容" }],
      },
    ] as any);
    vi.mocked(questionCommands.createAnswer).mockResolvedValue({
      id: 301,
      content: [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "答案内容" }],
        },
      ],
      createTime: 1,
      updateTime: 1,
    } as any);
    vi.mocked(questionCommands.addAnswer).mockResolvedValue({
      id: 11,
      groupId: 22,
      answers: [301],
      status: "in_progress",
    } as any);

    const tool = findTool(
      buildQuestionItemTools(),
      "create_question_answer_from_markdown",
    );
    const result = await tool.executor({
      questionId: 11,
      markdown: "# 答案内容",
    });

    expect(importFromMarkdown).toHaveBeenCalledWith("# 答案内容");
    expect(questionCommands.createAnswer).toHaveBeenCalled();
    expect(questionCommands.addAnswer).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ contentId: 301 }),
      false,
      expect.objectContaining({ suppressMutationEvent: true }),
    );
    expect((result as { metadata?: any }).metadata?.render?.rendererKey).toBe(
      "question-mutation",
    );
  });

  it("get_question_detail 应返回 question-query metadata", async () => {
    vi.mocked(getQuestionDetail).mockResolvedValue({
      kind: "question-detail",
      entityType: "question",
      id: 11,
      data: {
        id: 11,
        questionContent: "什么是缓存击穿？",
        status: "in_progress",
        groupId: 22,
        groupTitle: "系统设计",
        createTime: 1,
        updateTime: 2,
        resolvedTime: null,
        answerCount: 1,
        descriptionMarkdown: "",
        descriptionPreview: "",
        answers: [],
      },
    } as any);

    const tool = findTool(buildQuestionQueryTools(), "get_question_detail");
    const result = await tool.executor({ questionId: 11 });

    expect(getQuestionDetail).toHaveBeenCalledWith(11);
    expect((result as { metadata?: any }).metadata?.render?.rendererKey).toBe(
      "question-query",
    );
  });
});
