import { expect, it } from "vitest";
import {
  getCurrentSystemMessage,
  getCurrentTools,
  getDeclaredTools,
  getSystemMessageText,
  type Message,
} from "@earendil-works/pi-ai";
import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import { appendSessionEntries, buildSessionContext, createSessionFile } from "../../session";
import { memoryStore, network, request, resolved, session } from "./fixtures";

it("具名技能提示按轮替换与撤销，保留原会话指令且不累加过期目录", async () => {
  const document = appendSessionEntries(createSessionFile({ id: session.sessionId }), [
    {
      type: "message",
      message: {
        role: "system",
        content: "保留原有风格",
        sections: { "tau-skills": "旧技能目录" },
        timestamp: 1,
      },
    },
  ]);
  const store = memoryStore({ document });
  const api = network([{ text: "第一答" }, { text: "第二答" }]);
  let skills: string | null = "新技能目录";
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
    preparePrompt: async () => ({ sections: { "tau-skills": skills } }),
  });
  const currentPrompt = () => {
    const value = getCurrentSystemMessage(
      buildSessionContext(store.read().document).messages as unknown as Message[]
    );
    if (!value) throw new Error("缺少系统消息");
    return getSystemMessageText(value);
  };
  await (
    await runtime.start(request(store.read().revision))
  ).result;
  expect(currentPrompt()).toContain("保留原有风格");
  expect(currentPrompt()).toContain("新技能目录");
  expect(currentPrompt()).not.toContain("旧技能目录");
  skills = null;
  await (
    await runtime.start(request(store.read().revision, { runId: "validation-run-2" }))
  ).result;
  expect(currentPrompt()).toBe("保留原有风格");
});

it("持久化工具声明与移除，另一宿主能恢复历史定义但不能执行已撤销工具", async () => {
  const store = memoryStore();
  const tools = new AiToolRegistry();
  tools.register(
    {
      id: "read",
      name: "read_card",
      description: "读取卡片",
      inputSchema: { type: "object", properties: {} },
      risk: "read",
      sourceId: "test",
      executionIdentity: "read-1",
    },
    async () => ({ content: "卡片正文" })
  );
  const api = network([{ tool: "read_card", args: {} }, { text: "已读取" }, { text: "继续回答" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
  });
  await (
    await runtime.start(request(store.read().revision, { toolIds: ["read"] }))
  ).result;
  const messages = () =>
    buildSessionContext(store.read().document).messages as unknown as Message[];
  expect(getCurrentTools(messages()).map(tool => tool.name)).toEqual(["read_card"]);
  await (
    await runtime.start(request(store.read().revision, { runId: "validation-run-2", toolIds: [] }))
  ).result;
  expect(getCurrentTools(messages())).toHaveLength(0);
  expect(getDeclaredTools(messages()).map(tool => tool.name)).toEqual(["read_card"]);
});
