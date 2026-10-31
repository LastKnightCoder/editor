import { expect, it, vi } from "vitest";
import type { AiToolExecutionContext } from "@tau/ai/contracts";
import { AiToolRegistry } from "@tau/ai/tools";
import { AiSkillRegistry } from "@tau/ai/skills";

vi.mock("../../tauri", () => ({}));
vi.mock("../../image-generation", () => ({
  generateMobileImageResources: vi.fn(async () => [
    { url: "/resources/result.png", mimeType: "image/png", fileName: "result.png" },
  ]),
}));
vi.mock("../../editorMarkdown", () => ({ mobileMarkdown: {} }));
vi.mock("../../../features/calendar/cache", () => ({ invalidateCalendarQueries: vi.fn() }));
vi.mock("../../../router/query/PageQueryProvider", () => ({ getQueryClient: vi.fn() }));

import { buildChatSystemPrompt, registerHostCapabilities } from "../hostTools";
import { internalSkillSource } from "../skills";
import type { MobileAiService } from "../../ai";
import { generateMobileImageResources } from "../../image-generation";

/** 用真实注册表与技能表装配，只替身 MobileAiService 的注册入口 */
function fakeService() {
  const registry = new AiToolRegistry();
  const skills = new AiSkillRegistry();
  const requestQuestion = vi.fn(async () => ({ content: "{}" }));
  const getSnapshot = vi.fn(() => ({
    session: { databaseName: "data.db", sessionId: "s" },
    messages: [{ role: "user", content: [{ type: "image", image: "current-attachment" }] }],
  }));
  const service = {
    runs: { getSnapshot },
    tools: { register: (spec: never, execute: never) => registry.register(spec, execute) },
    skills: { registerSource: (source: never) => skills.registerSource(source) },
    interactions: { requestQuestion },
  } as unknown as MobileAiService;
  return { service, registry, skills, requestQuestion, getSnapshot };
}

const context = (): AiToolExecutionContext => ({
  session: { databaseName: "data.db", sessionId: "s" },
  runId: "r",
  executionId: "e",
  toolCallId: "t",
  signal: new AbortController().signal,
  operationId: "o",
});

it("注册与桌面同名的宿主工具，读写风险分级，释放后全部移除", () => {
  const { service, registry } = fakeService();
  const { toolIds, dispose } = registerHostCapabilities(service, "data.db");
  const specs = registry.list();
  expect(specs.map(spec => spec.name)).toEqual(
    expect.arrayContaining([
      "get_current_date",
      "search_knowledge",
      "get_content_markdown",
      "sql_query",
      "query_todos",
      "create_todo",
      "delete_calendar_event",
      "ask-question",
      "generate_image",
      "edit_image",
    ])
  );
  expect(toolIds).toHaveLength(specs.length);
  const risk = Object.fromEntries(specs.map(spec => [spec.name, spec.risk]));
  expect(risk).toMatchObject({
    search_knowledge: "read",
    sql_query: "read",
    query_todos: "read",
    create_todo: "write",
    update_todo: "write",
    delete_todo: "write",
    create_calendar_event: "write",
  });
  dispose();
  expect(registry.list()).toEqual([]);
});

it("写入工具在 manual 模式下先走审批，拒绝则不执行", async () => {
  const { service, registry } = fakeService();
  const { toolIds } = registerHostCapabilities(service, "data.db");
  const snapshot = registry.capture(toolIds);
  const id = snapshot.specs.find(spec => spec.name === "create_todo")!.id;
  const approve = vi.fn(async () => "deny" as const);
  await expect(
    snapshot.execute(id, { title: "x" }, context(), {
      interactionMode: "host",
      permissionMode: "manual",
      approve,
    })
  ).rejects.toThrow();
  expect(approve).toHaveBeenCalledTimes(1);

  const readId = snapshot.specs.find(spec => spec.name === "get_current_date")!.id;
  await snapshot.execute(readId, {}, context(), {
    interactionMode: "host",
    permissionMode: "manual",
    approve,
  });
  expect(approve).toHaveBeenCalledTimes(1);
});

it("ask-question 交给运行时承载提问", async () => {
  const { service, registry, requestQuestion } = fakeService();
  const { toolIds } = registerHostCapabilities(service, "data.db");
  const snapshot = registry.capture(toolIds);
  const id = snapshot.specs.find(spec => spec.name === "ask-question")!.id;
  await snapshot.execute(id, { questions: [] }, context(), {
    interactionMode: "host",
    permissionMode: "manual",
  });
  expect(requestQuestion).toHaveBeenCalledWith({ questions: [] }, expect.anything());
});

it("图片编辑从注册服务的当前运行快照读取附件，不重读会话文件", async () => {
  const { service, registry, getSnapshot } = fakeService();
  const { toolIds } = registerHostCapabilities(service, "data.db");
  const snapshot = registry.capture(toolIds);
  await snapshot.execute("host:edit_image", { prompt: "换背景" }, context(), {
    interactionMode: "host",
    permissionMode: "manual",
  });
  expect(getSnapshot).toHaveBeenCalledWith("r");
  expect(generateMobileImageResources).toHaveBeenCalledWith(
    expect.objectContaining({ imagePaths: ["current-attachment"], database: "data.db" })
  );
});

it("内置技能可被技能注册表解析，含 database-schema", async () => {
  const skills = new AiSkillRegistry();
  skills.registerSource(internalSkillSource);
  const list = await skills.list();
  expect(list.map(skill => skill.name)).toContain("主数据库结构与只读 SQL 查询");
});

it("系统提示带会话日期，并说明写入需确认", () => {
  const prompt = buildChatSystemPrompt(new Date(2026, 9, 30, 9, 5));
  expect(prompt).toContain("今天日期：2026-10-30");
  expect(prompt).toContain("星期五");
  expect(prompt).toContain("请用户确认");
});
