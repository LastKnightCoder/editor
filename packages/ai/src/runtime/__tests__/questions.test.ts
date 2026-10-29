import { expect, it, vi } from "vitest";
import type { AskQuestionSubmission } from "@tau/shared/chat-core";
import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import { deferred, memoryStore, network, request, resolved } from "./fixtures";

const payload = {
  title: "选择优先级",
  questions: [
    {
      id: "priority",
      question: "优先处理哪一项？",
      type: "single",
      required: true,
      options: [
        { label: "高优先级", value: "high" },
        { label: "低优先级", value: "low" },
      ],
    },
  ],
};
const submission: AskQuestionSubmission = {
  answers: [{ questionId: "priority", selectedValues: ["high"], otherText: "" }],
  submittedAt: 1,
};

function setup(question?: ConstructorParameters<typeof AiRuntime>[0]["question"]) {
  const store = memoryStore();
  const tools = new AiToolRegistry();
  const api = network([{ tool: "ask-question", args: payload }, { text: "已记录优先级。" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
    question,
  });
  tools.register(
    {
      id: "questions:ask",
      name: "ask-question",
      description: "询问用户的选择",
      inputSchema: {
        type: "object",
        properties: { questions: { type: "array" } },
        required: ["questions"],
      },
      risk: "read",
      sourceId: "questions",
      executionIdentity: "questions:1",
    },
    (input, context) => runtime.requestQuestion(input, context)
  );
  return { runtime, store, api };
}

it("none或未提供提问宿主时明确拒绝，不产生永久等待", async () => {
  const callback = vi.fn(async () => submission);
  for (const options of [
    { mode: "none" as const, question: callback },
    { mode: "host" as const, question: undefined },
  ]) {
    const { runtime, store, api } = setup(options.question);
    const input = request(store.read().revision, {
      toolIds: ["questions:ask"],
      interactionMode: options.mode,
    });
    const result = await (await runtime.start(input)).result;
    expect(result.outcome).toBe("completed");
    expect(api.requests).toHaveLength(2);
    expect(store.read().document.entries).toContainEqual(
      expect.objectContaining({
        type: "message",
        message: expect.objectContaining({
          role: "toolResult",
          isError: true,
          details: expect.objectContaining({ errorCode: "AI_INTERACTION_UNAVAILABLE" }),
        }),
      })
    );
    expect(runtime.getSnapshot(input.runId)?.questions).toHaveLength(0);
    await runtime.dispose();
  }
  expect(callback).not.toHaveBeenCalled();
});

it("显式提问宿主回调合法作答，问题快照与结构化工具结果完整保存", async () => {
  const entered = deferred<void>();
  const answer = deferred<AskQuestionSubmission>();
  const callback = vi.fn(async () => {
    entered.resolve();
    return answer.promise;
  });
  const { runtime, store, api } = setup(callback);
  const input = request(store.read().revision, {
    toolIds: ["questions:ask"],
    interactionMode: "host",
  });
  const handle = await runtime.start(input);
  await entered.promise;
  expect(runtime.getSnapshot(input.runId)).toMatchObject({
    status: "waiting-answer",
    questions: [
      expect.objectContaining({ payload: expect.objectContaining({ title: "选择优先级" }) }),
    ],
  });
  answer.resolve(submission);
  const result = await handle.result;
  expect(result.outcome).toBe("completed");
  expect(JSON.stringify(api.requests[1])).toContain("高优先级");
  expect(store.read().document.entries).toContainEqual(
    expect.objectContaining({
      type: "message",
      message: expect.objectContaining({
        role: "toolResult",
        details: expect.objectContaining({
          askQuestionResult: expect.objectContaining({ type: "ask-question-result" }),
        }),
      }),
    })
  );
  expect(runtime.getSnapshot(input.runId)?.questions).toHaveLength(0);
});

it("外部作答核验请求/执行/版本身份，非法选项和缺少必答题不放行", async () => {
  const entered = deferred<void>();
  const { runtime, store } = setup(async () => {
    entered.resolve();
    return new Promise<AskQuestionSubmission>(() => undefined);
  });
  const input = request(store.read().revision, {
    toolIds: ["questions:ask"],
    interactionMode: "host",
  });
  const handle = await runtime.start(input);
  await entered.promise;
  const pending = runtime.getSnapshot(input.runId)?.questions[0];
  if (!pending) throw new Error("提问未登记");
  const valid = {
    runId: input.runId,
    requestId: pending.requestId,
    executionId: pending.executionId,
    revision: pending.revision,
    submission,
  };
  expect(() => runtime.answerQuestion({ ...valid, requestId: "another-request" })).toThrow(
    expect.objectContaining({ code: "AI_INTERACTION_UNAVAILABLE" })
  );
  expect(() => runtime.answerQuestion({ ...valid, executionId: "another-execution" })).toThrow(
    expect.objectContaining({ code: "AI_INTERACTION_UNAVAILABLE" })
  );
  expect(() => runtime.answerQuestion({ ...valid, revision: pending.revision - 1 })).toThrow(
    expect.objectContaining({ code: "AI_INTERACTION_UNAVAILABLE" })
  );
  expect(() =>
    runtime.answerQuestion({ ...valid, submission: { answers: [], submittedAt: 1 } })
  ).toThrow(expect.objectContaining({ code: "AI_TOOL_ARGUMENT_INVALID" }));
  expect(() =>
    runtime.answerQuestion({
      ...valid,
      submission: {
        answers: [{ questionId: "priority", selectedValues: ["unknown"], otherText: "" }],
        submittedAt: 1,
      },
    })
  ).toThrow(expect.objectContaining({ code: "AI_TOOL_ARGUMENT_INVALID" }));
  expect(runtime.getSnapshot(input.runId)?.questions).toHaveLength(1);
  runtime.answerQuestion(valid);
  expect((await handle.result).outcome).toBe("completed");
  expect(() => runtime.answerQuestion(valid)).toThrow(
    expect.objectContaining({ code: "AI_INTERACTION_UNAVAILABLE" })
  );
});

it("中止运行结束pending问题并将取消信号传给宿主，不开启下一轮", async () => {
  const entered = deferred<void>();
  let received: AbortSignal | undefined;
  const { runtime, store, api } = setup(async (_question, signal) => {
    received = signal;
    entered.resolve();
    return new Promise<AskQuestionSubmission>(() => undefined);
  });
  const input = request(store.read().revision, {
    toolIds: ["questions:ask"],
    interactionMode: "host",
  });
  const handle = await runtime.start(input);
  await entered.promise;
  await runtime.abort(input.runId);
  expect(received?.aborted).toBe(true);
  expect((await handle.result).outcome).toBe("aborted");
  expect(api.requests).toHaveLength(1);
  expect(runtime.getSnapshot(input.runId)).toMatchObject({ status: "settled", questions: [] });
});
