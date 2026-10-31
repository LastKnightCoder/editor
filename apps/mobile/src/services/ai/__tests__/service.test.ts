import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { transferableAbortController } from "node:util";
import {
  appendSessionEntries,
  parseSessionFile,
  serializeSessionFile,
  type SessionDocument,
  type SessionEntry,
} from "@tau/ai/session";
import { createMobileAiService, type MobileAiOptions, type MobileAiService } from "../service";
import * as native from "../native";
import { scriptedFetch } from "../../../../validation/ai/fixtures";
import { createMobilePluginAI } from "../../../app/plugins/ai";
import { createMobilePluginMcp } from "../../../app/plugins/ai-mcp";
import type { PluginContext } from "@tau/plugins";

vi.mock("../native", () => ({
  acquireLibrary: vi.fn(),
  assertLibrary: vi.fn(),
  releaseLibrary: vi.fn(),
  setRunActive: vi.fn(),
  createSession: vi.fn(),
  readSession: vi.fn(),
  patchSession: vi.fn(),
  removeSession: vi.fn(),
  listSessions: vi.fn(),
  commitSession: vi.fn(),
  getModelConfig: vi.fn(),
  createModelFetch: vi.fn(),
  createMcpFetch: vi.fn(),
}));

type RecordState = { document: SessionDocument; row: native.NativeSessionRow; revision: number };
const records = new Map<string, RecordState>();
const services: MobileAiService[] = [];
const contextDisposals: ReturnType<typeof vi.fn>[] = [];
const config = {
  llmProviders: [
    {
      id: "test",
      name: "测试",
      api: "openai-completions",
      baseUrl: "https://validation.invalid/v1",
      models: [
        {
          id: "validation-model",
          input: ["text"],
          reasoning: false,
          contextWindow: 16000,
          maxTokens: 1000,
        },
      ],
    },
  ],
  llmUsageSettings: {},
};
const revision = (record: RecordState) => `revision-${record.revision}`;
const recordOf = (id: string) => {
  const record = records.get(id);
  if (!record) throw new Error("缺少模拟会话");
  return record;
};
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const metadata = (record: RecordState) => ({
  row: structuredClone(record.row),
  revision: revision(record),
  size: new TextEncoder().encode(serializeSessionFile(record.document)).length,
});
const service = (options?: MobileAiOptions) => {
  const value = createMobileAiService(options);
  services.push(value);
  return value;
};
const create = (value: MobileAiService) =>
  value.sessions.create({ databaseName: "test.db", id: "test-session", scope: "main-chat" });
const ref = { databaseName: "test.db", sessionId: "test-session" };
const request = (
  expectedRevision: string,
  extra: Partial<Parameters<MobileAiService["runs"]["start"]>[0]> = {}
) => ({
  runId: "run-test-0001",
  session: ref,
  expectedRevision,
  message: [{ type: "text" as const, text: "你好" }],
  model: { providerId: "test", modelId: "validation-model" },
  toolIds: [],
  skillIds: [],
  interactionMode: "none" as const,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  records.clear();
  contextDisposals.length = 0;
  vi.mocked(native.acquireLibrary).mockImplementation(async databaseName => ({
    leaseId: `lease-${databaseName}`,
    databaseName,
    generation: 1,
  }));
  vi.mocked(native.assertLibrary).mockImplementation(async lease => lease);
  vi.mocked(native.releaseLibrary).mockResolvedValue(undefined);
  vi.mocked(native.setRunActive).mockResolvedValue(undefined);
  vi.mocked(native.createSession).mockImplementation(async (_lease, input) => {
    const record: RecordState = {
      document: parseSessionFile(JSON.stringify(input.header) + "\n"),
      revision: 1,
      row: {
        id: input.id,
        scope: input.scope,
        domainRef: input.domainRef ?? null,
        sessionFile: `${input.id}.jsonl`,
        cwd: "",
        title: input.title ?? "",
        titleDirty: false,
        groupId: null,
        orderNum: null,
        archived: false,
        source: "mobile",
        messageCount: 0,
        createTime: 1,
        updateTime: 1,
      },
    };
    records.set(input.id, record);
    return metadata(record);
  });
  vi.mocked(native.readSession).mockImplementation(async (_lease, id, offset = 0) => {
    const record = records.get(id);
    if (!record) throw "AI_SESSION_NOT_FOUND:会话不存在";
    const bytes = new TextEncoder().encode(serializeSessionFile(record.document));
    const end = Math.min(offset + 31, bytes.length);
    return {
      row: structuredClone(record.row),
      revision: revision(record),
      data: encode(bytes.slice(offset, end)),
      nextOffset: end,
      eof: end === bytes.length,
    };
  });
  vi.mocked(native.commitSession).mockImplementation(async (_lease, input) => {
    const record = recordOf(input.sessionId);
    if (input.expectedRevision !== revision(record))
      throw "AI_SESSION_REVISION_CONFLICT:会话已变化";
    record.document = parseSessionFile(
      serializeSessionFile({
        ...record.document,
        entries: [...record.document.entries, ...(input.entries as SessionEntry[])],
      })
    );
    record.revision++;
    return metadata(record);
  });
  vi.mocked(native.patchSession).mockImplementation(async (_lease, id, expected, patch) => {
    const record = recordOf(id);
    if (expected !== revision(record)) throw "AI_SESSION_REVISION_CONFLICT:会话已变化";
    Object.assign(record.row, patch);
    record.revision++;
    return metadata(record);
  });
  vi.mocked(native.removeSession).mockImplementation(async (_lease, id) => {
    records.delete(id);
  });
  vi.mocked(native.listSessions).mockImplementation(async () => ({
    items: [...records.values()].map(record => structuredClone(record.row)),
    nextOffset: records.size,
    hasMore: false,
  }));
  vi.mocked(native.getModelConfig).mockImplementation(async () => structuredClone(config));
  vi.mocked(native.createModelFetch).mockImplementation(async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    contextDisposals.push(dispose);
    return {
      config: structuredClone(config),
      fetch: scriptedFetch("openai-completions", [{ text: "回复" }]).fetch,
      dispose,
    };
  });
});

afterEach(async () => {
  for (const value of services.splice(0)) await value.lifecycle.dispose();
});

it("持久会话使用分块UTF-8读取，元数据修改和历史编辑走原生CAS", async () => {
  const value = service();
  const initial = await create(value);
  expect(initial).toMatchObject({ row: { source: "mobile" }, formatVersion: 3, messages: [] });
  const record = recordOf(ref.sessionId);
  record.document = appendSessionEntries(record.document, [
    {
      type: "message",
      id: "user-1",
      message: { role: "user", content: "跨块中文正文", timestamp: 1 },
    },
  ]);
  const loaded = await value.sessions.get(ref);
  expect(loaded.messages[0].content).toBe("跨块中文正文");
  const patched = await value.sessions.patch(ref, loaded.revision, { archived: true });
  expect(patched.row.archived).toBe(true);
  const edited = await value.sessions.editHistory(ref, patched.revision, {
    kind: "omit",
    entryIds: ["user-1"],
  });
  expect(edited.messages).toEqual([]);
  expect(native.commitSession).toHaveBeenLastCalledWith(
    expect.objectContaining({ databaseName: "test.db" }),
    expect.objectContaining({
      expectedRevision: patched.revision,
      entries: [
        expect.objectContaining({ type: "context_edit", targetId: "user-1", replacement: null }),
      ],
    })
  );
  expect((await value.sessions.list("test.db")).items).toHaveLength(1);
  await value.sessions.remove(ref, edited.revision);
  expect((await value.sessions.list("test.db")).items).toHaveLength(0);
});

it("分块读取中revision变化时拒绝混合快照，原生错误转为公共错误", async () => {
  const value = service();
  await create(value);
  const original = vi.mocked(native.readSession).getMockImplementation();
  if (!original) throw new Error("缺少模拟读取器");
  vi.mocked(native.readSession).mockImplementation(async (...args) => {
    const result = await original(...args);
    return args[2] ? { ...result, revision: "changed" } : result;
  });
  await expect(value.sessions.get(ref)).rejects.toMatchObject({
    code: "AI_SESSION_REVISION_CONFLICT",
  });
  vi.mocked(native.readSession).mockImplementation(original);
  await expect(value.sessions.patch(ref, "old", { title: "不应保存" })).rejects.toMatchObject({
    code: "AI_SESSION_REVISION_CONFLICT",
  });
});

it("模型由原生冻结配置解析，不依赖列表查询时的另一份配置", async () => {
  const value = service();
  const initial = await create(value);
  vi.mocked(native.getModelConfig).mockResolvedValue({ llmProviders: [], llmUsageSettings: {} });
  const handle = await value.runs.start(request(initial.revision));
  expect((await handle.result).outcome).toBe("completed");
  expect(native.getModelConfig).not.toHaveBeenCalled();
  expect(contextDisposals[0]).toHaveBeenCalledTimes(1);
  expect(native.setRunActive).toHaveBeenCalledWith(
    expect.anything(),
    "run-test-0001",
    true,
    "test-session"
  );
});

it("运行期间拒绝编辑与维护，取消后释放原生忙态和网络上下文", async () => {
  const value = service();
  const initial = await create(value);
  let started!: () => void;
  const ready = new Promise<void>(resolve => {
    started = resolve;
  });
  const dispose = vi.fn().mockResolvedValue(undefined);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: structuredClone(config),
    dispose,
    fetch: async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("已取消", "AbortError")),
          { once: true }
        );
        started();
      }),
  });
  const handle = await value.runs.start(request(initial.revision));
  await ready;
  await expect(
    value.sessions.patch(ref, initial.revision, { title: "不应保存" })
  ).rejects.toMatchObject({ code: "AI_SESSION_BUSY" });
  await expect(value.lifecycle.prepareMaintenance("test.db")).rejects.toMatchObject({
    code: "AI_LIBRARY_BUSY",
  });
  await handle.abort();
  expect((await handle.result).outcome).toBe("aborted");
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(native.setRunActive).toHaveBeenCalledWith(
    expect.anything(),
    "run-test-0001",
    false,
    "test-session"
  );
});

it("自动技能使用run局部辅助工具，目录和执行来自同一技能快照", async () => {
  const value = service();
  const initial = await create(value);
  value.skills.registerSource({
    id: "builtin",
    revision: "v1",
    list: async () => [{ id: "summary", path: "summary/SKILL.md" }],
    read: async () => "---\nname: summary\ndescription: 整理卡片\n---\n提取行动项。",
  });
  const execute = vi.fn(async () => ({ content: "本机读取结果" }));
  value.tools.register(
    {
      id: "local-read",
      name: "local_read",
      description: "读取",
      risk: "read",
      sourceId: "local",
      executionIdentity: "v1",
      inputSchema: { type: "object", properties: {} },
    },
    execute
  );
  const network = scriptedFetch("openai-completions", [
    { name: "load_skill", args: { id: "builtin:summary" } },
    { name: "local_read", args: {} },
    { text: "完成" },
  ]);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: structuredClone(config),
    fetch: network.fetch,
    dispose: vi.fn().mockResolvedValue(undefined),
  });
  const handle = await value.runs.start(request(initial.revision, { toolIds: ["local-read"] }));
  expect((await handle.result).outcome).toBe("completed");
  expect(execute).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(network.requests[0])).toContain("builtin:summary");
  expect(JSON.stringify(network.requests[1])).toContain("提取行动项");
  expect(value.tools.list().map(tool => tool.id)).toEqual(["local-read"]);
});

it("插件 MCP 工具按库加入模型循环，执行仍需审批，停用后退出目录", async () => {
  const approve = vi.fn(async () => "allow" as const);
  const value = service({ permissionMode: () => "manual", approve });
  const initial = await create(value);
  const plugin = createMobilePluginMcp({ databaseName: "test.db", ai: () => value });
  const execute = vi.fn(async () => ({ content: "插件读取的笔记" }));
  try {
    plugin.adapter.register(
      {
        pluginId: "test.notes",
        workspaceId: "test.db",
        signal: new AbortController().signal,
      } as PluginContext,
      {
        id: "notes",
        name: "笔记",
        tools: [
          { name: "lookup", description: "读取笔记", inputSchema: { type: "object" }, execute },
        ],
      },
      { id: "test.notes", name: "笔记插件", executionIdentity: "activation-1" }
    );
    await plugin.ready();
    const tools = value.tools.list({ databaseName: "test.db" });
    expect(tools).toHaveLength(1);
    expect(value.tools.list({ databaseName: "other.db" })).toEqual([]);
    const network = scriptedFetch("openai-completions", [
      { name: tools[0].name, args: {} },
      { text: "已查到笔记" },
    ]);
    vi.mocked(native.createModelFetch).mockResolvedValue({
      config: structuredClone(config),
      fetch: network.fetch,
      dispose: vi.fn(),
    });
    const handle = await value.runs.start(
      request(initial.revision, {
        toolIds: tools.map(tool => tool.id),
        interactionMode: "host",
      })
    );
    expect((await handle.result).outcome).toBe("completed");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(network.requests[1])).toContain("插件读取的笔记");
  } finally {
    await plugin.dispose();
  }
  expect(value.tools.list({ databaseName: "test.db" })).toEqual([]);
});

it("显式选择才能将手动 Skill 正文注入首轮，并随用户消息落盘", async () => {
  const value = service();
  const initial = await create(value);
  value.skills.registerSource({
    id: "notes",
    revision: "1",
    list: async () => [
      { id: "weekly", path: "weekly/SKILL.md" },
      { id: "private", path: "private/SKILL.md" },
    ],
    read: async path =>
      `---\nname: ${path.split("/")[0]}\ndescription: 手动技能\ndisable-model-invocation: true\n---\n${path.startsWith("weekly") ? "按本周成果与下周计划整理" : "未被选择的独立说明"}`,
  });
  value.tools.register(
    {
      id: "read",
      name: "read",
      sourceId: "host",
      executionIdentity: "1",
      risk: "read",
      description: "读取",
      inputSchema: { type: "object" },
    },
    async () => ({ content: "ok" })
  );
  const network = scriptedFetch("openai-completions", [{ text: "本周成果" }]);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: structuredClone(config),
    fetch: network.fetch,
    dispose: vi.fn(),
  });
  const handle = await value.runs.start(
    request(initial.revision, {
      message: [{ type: "text", text: "帮我写周报", skills: ["notes:weekly"] }],
      toolIds: ["read"],
      skillIds: ["notes:weekly"],
    })
  );
  expect((await handle.result).outcome).toBe("completed");
  expect(JSON.stringify(network.requests[0])).toContain("按本周成果与下周计划整理");
  expect(JSON.stringify(network.requests[0])).not.toContain("未被选择的独立说明");
  expect((await value.sessions.get(ref)).messages[0].content).toEqual([
    { type: "text", text: "帮我写周报", skills: ["notes:weekly"] },
  ]);
});

it("toolIds为空时不向模型提供技能或业务工具", async () => {
  const value = service();
  const initial = await create(value);
  value.skills.registerSource({
    id: "builtin",
    revision: "v1",
    list: async () => [{ id: "summary", path: "summary/SKILL.md" }],
    read: async () => "---\nname: summary\ndescription: 整理卡片\n---\n提取行动项。",
  });
  const network = scriptedFetch("openai-completions", [{ text: "完成" }]);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: structuredClone(config),
    fetch: network.fetch,
    dispose: vi.fn().mockResolvedValue(undefined),
  });
  const handle = await value.runs.start(
    request(initial.revision, { skillIds: ["builtin:summary"] })
  );
  await handle.result;
  expect(network.requests[0].tools).toBeUndefined();
  expect(JSON.stringify(network.requests[0])).toContain("提取行动项");
});

it("冻结模型配置不完整时释放原生上下文，不伪装为已接受运行", async () => {
  const value = service();
  const initial = await create(value);
  const dispose = vi.fn().mockResolvedValue(undefined);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: { llmProviders: [], llmUsageSettings: {} },
    fetch: vi.fn(),
    dispose,
  });
  await expect(value.runs.start(request(initial.revision))).rejects.toMatchObject({
    code: "AI_MODEL_UNAVAILABLE",
  });
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(native.setRunActive).toHaveBeenCalledWith(
    expect.anything(),
    "run-test-0001",
    false,
    "test-session"
  );
});

it("单次生成透传快照且不创建聊天历史，只持有一次原生运行租约", async () => {
  const value = service();
  await create(value);
  vi.mocked(native.setRunActive).mockClear();
  const updates: string[] = [];
  const handle = await value.generation.start(
    {
      requestId: "generation-test-001",
      databaseName: "test.db",
      model: { providerId: "test", modelId: "validation-model" },
      messages: [{ role: "user", content: "你好" }],
    },
    snapshot => {
      updates.push(snapshot.content);
    }
  );
  const result = await handle.result;
  expect(result).toMatchObject({ outcome: "completed", response: { content: "回复" } });
  expect(updates).toContain("回复");
  expect(native.commitSession).not.toHaveBeenCalled();
  expect(vi.mocked(native.setRunActive).mock.calls.map(call => call[2])).toEqual([true, false]);
  expect(contextDisposals[0]).toHaveBeenCalledTimes(1);
});

it("释放服务会等待单次生成取消，完成后不残留网络上下文或库忙态", async () => {
  const value = service();
  let started!: () => void;
  const ready = new Promise<void>(resolve => {
    started = resolve;
  });
  const dispose = vi.fn().mockResolvedValue(undefined);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: structuredClone(config),
    dispose,
    fetch: async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("已取消", "AbortError")),
          { once: true }
        );
        started();
      }),
  });
  const handle = await value.generation.start({
    requestId: "generation-dispose-001",
    databaseName: "test.db",
    model: { providerId: "test", modelId: "validation-model" },
    messages: [{ role: "user", content: "等待" }],
  });
  await ready;
  await value.lifecycle.dispose();
  expect((await handle.result).outcome).toBe("aborted");
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(native.releaseLibrary).toHaveBeenCalledTimes(1);
  expect(vi.mocked(native.setRunActive).mock.calls.map(call => call[2])).toEqual([true, false]);
});

it("MCP连接失败时回收已创建的原生网络上下文", async () => {
  const value = service();
  const dispose = vi.fn().mockResolvedValue(undefined);
  vi.mocked(native.createMcpFetch).mockResolvedValue({
    fetch: async () => {
      throw new Error("模拟网络失败");
    },
    dispose,
  });
  await expect(
    value.mcp.connect("test.db", {
      id: "remote",
      name: "远程",
      transport: { type: "streamable-http", url: "https://validation.invalid/mcp" },
    })
  ).rejects.toMatchObject({ code: "AI_MCP_CONNECTION_FAILED" });
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(value.mcp.list("test.db")[0].status).toBe("error");
});

it("stdio显式不支持；维护关闭租约且释放前不接受新调用", async () => {
  const value = service();
  await create(value);
  value.tools.register(
    {
      id: "maintenance-read",
      name: "maintenance_read",
      description: "读取",
      risk: "read",
      sourceId: "local",
      executionIdentity: "v1",
      inputSchema: { type: "object" },
    },
    async () => ({ content: "ok" }),
    { databaseName: "test.db" }
  );
  value.skills.registerSource(
    {
      id: "maintenance",
      revision: "v1",
      list: async () => [{ id: "guide", path: "guide/SKILL.md" }],
      read: async () => "---\nname: guide\ndescription: 维护后可用的说明\n---\n说明正文",
    },
    { databaseName: "test.db" }
  );
  expect(
    await value.mcp.connect("test.db", {
      id: "local",
      name: "本机",
      transport: { type: "stdio", command: "node" },
    })
  ).toMatchObject({ status: "unsupported_transport" });
  expect(native.createMcpFetch).not.toHaveBeenCalled();
  const resume = await value.lifecycle.prepareMaintenance("test.db");
  await expect(value.sessions.get(ref)).rejects.toMatchObject({ code: "AI_LIBRARY_BUSY" });
  expect(native.releaseLibrary).toHaveBeenCalledTimes(1);
  resume();
  expect(value.tools.list().map(tool => tool.id)).toContain("maintenance-read");
  expect((await value.skills.list()).map(skill => skill.id)).toContain("maintenance:guide");
  await value.sessions.get(ref);
  expect(native.acquireLibrary).toHaveBeenCalledTimes(2);
});

it("库释放回收限定注册，默认能力不宣称具备交互或脚本执行", async () => {
  const value = service();
  await create(value);
  value.tools.register(
    {
      id: "scoped",
      name: "scoped",
      description: "限定",
      risk: "read",
      sourceId: "test",
      executionIdentity: "v1",
      inputSchema: { type: "object" },
    },
    async () => ({ content: "ok" }),
    { databaseName: "test.db" }
  );
  await value.lifecycle.releaseLibrary("test.db");
  expect(value.tools.list()).toEqual([]);
  expect(value.capabilities).toMatchObject({
    approvals: false,
    questions: false,
    skillScripts: false,
  });
  await value.lifecycle.dispose();
  expect(() => value.runs.subscribe("later", vi.fn())).toThrow(
    expect.objectContaining({ code: "AI_LIBRARY_CHANGED" })
  );
});

it("限定库的工具不能被另一库会话选中", async () => {
  const value = service();
  const initial = await create(value);
  const execute = vi.fn(async () => ({ content: "不应执行" }));
  value.tools.register(
    {
      id: "library-tool",
      name: "library_tool",
      description: "属于其他库",
      risk: "read",
      sourceId: "scoped",
      executionIdentity: "v1",
      inputSchema: { type: "object" },
    },
    execute,
    { databaseName: "other.db" }
  );
  await expect(
    value.runs.start(request(initial.revision, { toolIds: ["library-tool"] }))
  ).rejects.toMatchObject({ code: "AI_LIBRARY_CHANGED" });
  expect(execute).not.toHaveBeenCalled();
  expect(native.createModelFetch).not.toHaveBeenCalled();
});

it("失败重试复用原用户entry，不通过重新追加问题伪装重试", async () => {
  const value = service();
  const initial = await create(value);
  vi.mocked(native.createModelFetch).mockResolvedValueOnce({
    config: structuredClone(config),
    dispose: vi.fn().mockResolvedValue(undefined),
    fetch: async () =>
      new Response(JSON.stringify({ error: { message: "验证失败" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  });
  const failed = await value.runs.start(request(initial.revision));
  expect((await failed.result).outcome).toBe("failed");
  const current = await value.sessions.get(ref);
  const entryId = current.document.entries.find(
    entry => entry.type === "message" && entry.message?.role === "user"
  )?.id;
  if (!entryId) throw new Error("测试应保留原用户消息");
  const retry = request(current.revision, { runId: "retry-test-0001" });
  const handle = await value.runs.retryLast({
    runId: retry.runId,
    session: retry.session,
    expectedRevision: retry.expectedRevision,
    model: retry.model,
    toolIds: retry.toolIds,
    skillIds: retry.skillIds,
    interactionMode: retry.interactionMode,
    entryId,
  });
  expect((await handle.result).outcome).toBe("completed");
  const final = await value.sessions.get(ref);
  expect(
    final.document.entries.filter(
      entry => entry.type === "message" && entry.message?.role === "user"
    )
  ).toHaveLength(1);
  expect(
    final.document.entries.filter(entry => entry.customType === "desktop-display")
  ).toHaveLength(1);
});

it("工具返回后仍验证原生租约，失效结果不能被当成成功展示", async () => {
  const value = service({ permissionMode: () => "bypass" });
  const initial = await create(value);
  value.tools.register(
    {
      id: "guarded",
      name: "guarded",
      description: "带租约",
      risk: "write",
      sourceId: "local",
      executionIdentity: "v1",
      inputSchema: { type: "object" },
    },
    async () => {
      vi.mocked(native.assertLibrary).mockRejectedValueOnce("AI_LIBRARY_CHANGED:模拟换库");
      return { content: "不应显示为成功" };
    },
    { databaseName: "test.db" }
  );
  const network = scriptedFetch("openai-completions", [
    { name: "guarded", args: {} },
    { text: "已停止" },
  ]);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: structuredClone(config),
    fetch: network.fetch,
    dispose: vi.fn().mockResolvedValue(undefined),
  });
  const handle = await value.runs.start(request(initial.revision, { toolIds: ["guarded"] }));
  const result = await handle.result;
  expect(result.outcome).toBe("failed");
  expect(result.error?.code).toBe("AI_TOOL_OUTCOME_UNKNOWN");
  expect(JSON.stringify(result.messages)).toContain("写入结果未知");
  expect(JSON.stringify(result.messages)).not.toContain("不应显示为成功");
});

it("后台暂停阻止新调用，恢复前台不重放任务", async () => {
  const value = service();
  const initial = await create(value);
  await value.lifecycle.suspend();
  await expect(value.runs.start(request(initial.revision))).rejects.toMatchObject({
    code: "AI_LIBRARY_BUSY",
  });
  await expect(
    value.sessions.patch(ref, initial.revision, { title: "不应保存" })
  ).rejects.toMatchObject({ code: "AI_LIBRARY_BUSY" });
  await expect(
    value.generation.start({
      requestId: "paused-generate",
      databaseName: "test.db",
      model: { providerId: "test", modelId: "validation-model" },
      messages: [{ role: "user", content: "不应请求" }],
    })
  ).rejects.toMatchObject({ code: "AI_LIBRARY_BUSY" });
  await value.lifecycle.resume();
  expect(native.createModelFetch).not.toHaveBeenCalled();
  expect((await value.sessions.get(ref)).messages).toEqual([]);
});

it("前台恢复请求不能越过随后发生的后台暂停", async () => {
  const value = service();
  const initial = await create(value);
  let finish!: () => void;
  const released = new Promise<void>(resolve => {
    finish = resolve;
  });
  vi.mocked(native.releaseLibrary).mockImplementation(() => released);
  const first = value.lifecycle.suspend();
  const resume = value.lifecycle.resume();
  const last = value.lifecycle.suspend();
  finish();
  await Promise.all([first, resume, last]);
  await expect(value.runs.start(request(initial.revision))).rejects.toMatchObject({
    code: "AI_LIBRARY_BUSY",
  });
  await value.lifecycle.resume();
  expect((await value.sessions.get(ref)).messages).toEqual([]);
});

it("前后台暂停保留限定库声明，显式新运行重新取得原生租约", async () => {
  const value = service();
  let leaseId = 0;
  vi.mocked(native.acquireLibrary).mockImplementation(async databaseName => ({
    databaseName,
    leaseId: `lease-${++leaseId}`,
    generation: 1,
  }));
  vi.mocked(native.createModelFetch).mockImplementation(async () => ({
    config: structuredClone(config),
    dispose: vi.fn().mockResolvedValue(undefined),
    fetch: scriptedFetch("openai-completions", [{ name: "scope_read", args: {} }, { text: "完成" }])
      .fetch,
  }));
  const initial = await create(value);
  const leases: string[] = [];
  value.tools.register(
    {
      id: "scope-read",
      name: "scope_read",
      description: "读取",
      risk: "read",
      sourceId: "local",
      executionIdentity: "v1",
      inputSchema: { type: "object" },
    },
    async (_input, context) => {
      leases.push((await value.lifecycle.assertExecution(context)).leaseId);
      return { content: "读取完成" };
    },
    { databaseName: "test.db" }
  );
  const first = await value.runs.start(request(initial.revision, { toolIds: ["scope-read"] }));
  expect((await first.result).outcome).toBe("completed");
  await value.lifecycle.suspend();
  await value.lifecycle.resume();
  expect(value.tools.list().map(tool => tool.id)).toEqual(["scope-read"]);
  const current = await value.sessions.get(ref);
  const second = await value.runs.start(
    request(current.revision, { runId: "resume-test-0001", toolIds: ["scope-read"] })
  );
  expect((await second.result).outcome).toBe("completed");
  expect(leases).toEqual(["lease-1", "lease-2"]);
});

it("插件请求经正式移动服务与pi SDK完成流式单发及用量结算，不生成聊天文件", async () => {
  const abortController = transferableAbortController();
  vi.stubGlobal("AbortController", abortController.constructor);
  vi.stubGlobal("AbortSignal", abortController.signal.constructor);
  const value = service();
  const api = scriptedFetch("anthropic-messages", [{ text: "插件总结" }]);
  const modelConfig = structuredClone(config);
  modelConfig.llmProviders[0].api = "anthropic-messages";
  vi.mocked(native.getModelConfig).mockResolvedValue(modelConfig);
  vi.mocked(native.createModelFetch).mockResolvedValue({
    config: modelConfig,
    fetch: api.fetch,
    dispose: vi.fn().mockResolvedValue(undefined),
  });
  const call = vi.fn(async (command: string) => {
    if (command === "plugin_ai_register") return "plugin-session";
    if (command === "plugin_ai_prepare")
      return { model: request("").model, revision: "assignment-1" };
    if (command === "plugin_ai_begin")
      return { model: request("").model, maxOutputTokens: 128, modelRevision: "a".repeat(64) };
    if (command === "plugin_ai_finish") return { accepted: true };
  });
  const plugin = createMobilePluginAI({
    databaseName: "test.db",
    token: "plugin-transport",
    ai: () => value,
    call: call as never,
  });
  try {
    const client = await plugin.adapter.bind(
      { id: "test.summary", name: "摘要" },
      [{ id: "summary", name: "摘要" }],
      new AbortController().signal
    );
    const events = [];
    for await (const event of client.stream({
      feature: "summary",
      messages: [
        { role: "system", content: "请概括" },
        { role: "user", content: "正文" },
      ],
    }))
      events.push(event);
    expect(
      events
        .filter(event => event.type === "text")
        .map(event => event.delta)
        .join("")
    ).toBe("插件总结");
    expect(events.at(-1)).toEqual({
      type: "done",
      result: { text: "插件总结", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    });
    expect(call).toHaveBeenCalledWith(
      "plugin_ai_finish",
      expect.objectContaining({
        status: "ok",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })
    );
    expect(api.requests[0]).toMatchObject({
      max_tokens: 128,
      messages: [{ role: "user", content: [{ type: "text", text: "正文" }] }],
    });
    expect(records.size).toBe(0);
    expect(native.commitSession).not.toHaveBeenCalled();
  } finally {
    await plugin.dispose();
    vi.unstubAllGlobals();
  }
});
