import { beforeEach, describe, expect, it } from "vitest";
import {
  getAskQuestionSessionStore,
  useAskQuestionSessionStore,
} from "../askQuestionSessionStore";

const resetAskQuestionStore = () => {
  const store = getAskQuestionSessionStore();
  Object.keys(store.records).forEach((sessionId) => {
    store.removeRecord(sessionId);
  });
  localStorage.removeItem("ask-question-session");
};

describe("askQuestionSessionStore", () => {
  beforeEach(() => {
    resetAskQuestionStore();
  });

  it("可按 execution 上下文提交并锁定对应会话", () => {
    const store = getAskQuestionSessionStore();
    store.createPending({
      toolCallId: "duplicate-call",
      toolName: "ask-question",
      conversationKey: "conv-old",
      rawInput: '{"scope":"old"}',
      payload: {
        questions: [
          {
            id: "q1",
            question: "旧问题",
            type: "single",
            options: [{ label: "old", value: "old" }],
            required: true,
          },
        ],
      },
    });
    const target = store.createPending({
      toolCallId: "duplicate-call",
      toolName: "ask-question",
      conversationKey: "conv-target",
      rawInput: '{"scope":"target"}',
      payload: {
        questions: [
          {
            id: "q1",
            question: "目标问题",
            type: "single",
            options: [{ label: "A", value: "A" }],
            required: true,
          },
        ],
      },
    });

    const result = store.submitAnswersByExecution(
      {
        toolCallId: "duplicate-call",
        rawInput: '{"scope":"target"}',
        timestamp: target.createdAt,
        conversationKey: "conv-target",
      },
      {
        submittedAt: 123,
        answers: [
          {
            questionId: "q1",
            selectedValues: ["A"],
            otherText: "",
          },
        ],
      },
    );

    expect(result).toBe("stored");
    const targetRecord = getAskQuestionSessionStore().records[target.sessionId];
    expect(targetRecord?.status).toBe("submitted");
    expect(targetRecord?.submittedAnswers?.answers[0]?.selectedValues).toEqual([
      "A",
    ]);
  });

  it("支持 v1 结构迁移到 v2", async () => {
    localStorage.setItem(
      "ask-question-session",
      JSON.stringify({
        state: {
          records: {
            legacyKey: {
              toolCallId: "legacy-call",
              conversationKey: "legacy-conv",
              rawInput: "{}",
              payload: { questions: [] },
              status: "pending",
              createdAt: 999,
              updatedAt: 1000,
            },
          },
        },
        version: 1,
      }),
    );

    await useAskQuestionSessionStore.persist.rehydrate();
    const records = Object.values(getAskQuestionSessionStore().records);

    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toContain("legacy-conv::legacy-call::999");
    expect(records[0].toolName).toBe("ask-question");
  });
});
