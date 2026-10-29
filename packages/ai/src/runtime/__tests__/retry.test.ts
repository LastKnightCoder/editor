import { expect, it } from "vitest";
import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import { memoryStore, network, request, resolved } from "./fixtures";

it("失败重试保留原用户和展示entry，省略空回答，用桌面相同的隐藏重试消息续跑", async () => {
  const store = memoryStore();
  const failure = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () =>
      resolved(async () => new Response('{"error":{"message":"unauthorized"}}', { status: 401 })),
  });
  const first = await (await failure.start(request(store.read().revision))).result;
  expect(first.outcome).toBe("failed");
  const userEntryId = first.messages[0].piEntryIds?.[0];
  if (!userEntryId) throw new Error("问题未持久化");
  const api = network([{ text: "重试成功" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  const handle = await runtime.retryLast({
    ...request(store.read().revision, { runId: "retry-run-2" }),
    entryId: userEntryId,
  });
  const result = await handle.result;
  expect(result.outcome).toBe("completed");
  expect(
    store
      .read()
      .document.entries.filter(entry => entry.type === "message" && entry.message?.role === "user")
  ).toHaveLength(1);
  expect(result.messages[0].piEntryIds).toEqual(first.messages[0].piEntryIds);
  expect(JSON.stringify(store.read().document)).toContain("desktop-retry");
  expect(result.messages.at(-1)?.content).toBe("重试成功");
  const revision = store.read().revision;
  await expect(
    runtime.retryLast({ ...request(revision, { runId: "retry-run-3" }), entryId: userEntryId })
  ).rejects.toMatchObject({ code: "AI_SESSION_INVALID" });
  expect(store.read().revision).toBe(revision);
});

it("配置校验未通过时不修改会话文件或目录revision", async () => {
  const store = memoryStore();
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => {
      throw new Error("模型未配置");
    },
  });
  const revision = store.read().revision;
  await expect(runtime.start(request(revision))).rejects.toThrow("模型未配置");
  expect(store.read().revision).toBe(revision);
  expect(store.commits).toHaveLength(0);
});
