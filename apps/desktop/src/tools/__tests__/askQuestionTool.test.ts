import { describe, expect, it, beforeEach } from "vitest";
import { createAskQuestionTool } from "@/tools/askQuestionTool";
import { getAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";

const resetAskQuestionStore = () => {
  const store = getAskQuestionSessionStore();
  Object.keys(store.records).forEach((sessionId) => {
    store.removeRecord(sessionId);
  });
  localStorage.removeItem("ask-question-session");
};

const findSessionByToolCallId = (toolCallId: string) =>
  Object.values(getAskQuestionSessionStore().records).find(
    (record) => record.toolCallId === toolCallId,
  );

describe("askQuestionTool", () => {
  beforeEach(() => {
    resetAskQuestionStore();
  });

  it("参数非法时应返回参数错误结果", async () => {
    const tool = createAskQuestionTool();
    const result = await tool.executor(
      { questions: [] },
      {
        toolCallId: "call-invalid",
        toolName: "ask-question",
        source: "test",
      },
    );

    expect(result).toMatchObject({
      isParameterError: true,
    });
  });

  it("用户提交答案后应返回结构化结果并结束会话", async () => {
    const tool = createAskQuestionTool();

    const executionPromise = tool.executor(
      {
        title: "确认需求",
        questions: [
          {
            id: "q1",
            question: "你更偏向哪个方向？",
            type: "single",
            options: ["方案A", "方案B"],
          },
        ],
      },
      {
        toolCallId: "call-resolve",
        toolName: "ask-question",
        source: "test",
        conversationKey: "main-chat:1",
      },
    );

    const store = getAskQuestionSessionStore();
    const pendingRecord = findSessionByToolCallId("call-resolve");
    expect(pendingRecord?.status).toBe("pending");

    store.submitAnswers(pendingRecord!.sessionId, {
      submittedAt: 1234567890,
      answers: [
        {
          questionId: "q1",
          selectedValues: ["方案A"],
          otherText: "",
        },
      ],
    });

    const result = await executionPromise;
    expect(result).toBeTruthy();
    const parsed = JSON.parse(
      typeof result === "string" ? result : String(result?.content),
    );
    expect(parsed.type).toBe("ask-question-result");
    expect(parsed.answers?.[0]?.selectedOptions?.[0]?.value).toBe("方案A");
    expect(findSessionByToolCallId("call-resolve")?.status).toBe("completed");
  });

  it("中止信号触发时应取消会话并抛出错误", async () => {
    const tool = createAskQuestionTool();
    const controller = new AbortController();

    const executionPromise = tool.executor(
      {
        questions: [
          {
            id: "q1",
            question: "是否继续？",
            type: "single",
            options: ["是", "否"],
          },
        ],
      },
      {
        toolCallId: "call-abort",
        toolName: "ask-question",
        source: "test",
        signal: controller.signal,
      },
    );

    controller.abort();
    await expect(executionPromise).rejects.toThrow("会话已中止");
    expect(findSessionByToolCallId("call-abort")?.status).toBe("cancelled");
  });

  it("相同 toolCallId 的不同会话提交不应互相覆盖", async () => {
    const tool = createAskQuestionTool();

    const executionPromiseA = tool.executor(
      {
        questions: [
          {
            id: "q1",
            question: "A 对话问题",
            type: "single",
            options: ["A1", "A2"],
          },
        ],
      },
      {
        toolCallId: "call-duplicate",
        toolName: "ask-question",
        source: "test",
        conversationKey: "main-chat:100",
      },
    );

    const executionPromiseB = tool.executor(
      {
        questions: [
          {
            id: "q1",
            question: "B 对话问题",
            type: "single",
            options: ["B1", "B2"],
          },
        ],
      },
      {
        toolCallId: "call-duplicate",
        toolName: "ask-question",
        source: "test",
        conversationKey: "main-chat:200",
      },
    );

    const sessions = Object.values(getAskQuestionSessionStore().records).filter(
      (record) => record.toolCallId === "call-duplicate",
    );
    expect(sessions).toHaveLength(2);

    const sessionA = sessions.find(
      (record) => record.conversationKey === "main-chat:100",
    );
    const sessionB = sessions.find(
      (record) => record.conversationKey === "main-chat:200",
    );
    expect(sessionA).toBeTruthy();
    expect(sessionB).toBeTruthy();

    getAskQuestionSessionStore().submitAnswers(sessionA!.sessionId, {
      submittedAt: 2000000001,
      answers: [
        {
          questionId: "q1",
          selectedValues: ["A1"],
          otherText: "",
        },
      ],
    });
    getAskQuestionSessionStore().submitAnswers(sessionB!.sessionId, {
      submittedAt: 2000000002,
      answers: [
        {
          questionId: "q1",
          selectedValues: ["B2"],
          otherText: "",
        },
      ],
    });

    const resultA = await executionPromiseA;
    const resultB = await executionPromiseB;
    const parsedA = JSON.parse(
      typeof resultA === "string" ? resultA : String(resultA?.content),
    );
    const parsedB = JSON.parse(
      typeof resultB === "string" ? resultB : String(resultB?.content),
    );
    expect(parsedA.answers?.[0]?.selectedOptions?.[0]?.value).toBe("A1");
    expect(parsedB.answers?.[0]?.selectedOptions?.[0]?.value).toBe("B2");
  });
});
