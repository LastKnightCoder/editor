import { expect, it } from "vitest";
import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import { memoryStore, network, request, resolved, session } from "./fixtures";

it.each([16, 100000])("单发输出预算 %s 经SDK发送并受模型容量限制", async maxOutputTokens => {
  const store = memoryStore();
  const api = network([{ text: "回答" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (
    await runtime.generate({
      requestId: "limits-generation",
      databaseName: session.databaseName,
      model: { providerId: "validation", modelId: "validation-model" },
      messages: [{ role: "user", content: "回答" }],
      maxOutputTokens,
      temperature: 0,
    })
  ).result;
  expect(result.outcome).toBe("completed");
  expect(api.requests[0].max_tokens ?? api.requests[0].max_completion_tokens).toBe(
    Math.min(maxOutputTokens, 1000)
  );
  expect(api.requests[0].temperature).toBe(0);
});

it("不合法预算在用户消息落盘前拒绝", async () => {
  const store = memoryStore();
  const api = network([{ text: "不应调用" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  await expect(
    runtime.start(request(store.read().revision, { maxOutputTokens: -1 }))
  ).rejects.toMatchObject({ code: "AI_SESSION_INVALID" });
  expect(store.commits).toHaveLength(0);
  expect(api.requests).toHaveLength(0);
});
