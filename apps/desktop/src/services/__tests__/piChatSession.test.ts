import { afterEach, describe, expect, it, vi } from "vitest";
import { piChatSessionManager, type EnsureChatSessionOptions } from "../piChatSession";
import { registerPiToolSessionContext } from "../piToolBridge";
import {
  piSessionCreate,
  piSessionDispose,
  piSessionFindByScope,
  piSessionSetActiveTools,
  piSessionSetSystemPrompt,
} from "@/commands/piSession";

vi.mock("@/commands/piSession", () => ({
  piSessionCreate: vi.fn().mockResolvedValue({ ok: true }),
  piSessionDispose: vi.fn().mockResolvedValue({ ok: true }),
  piSessionSetSystemPrompt: vi.fn().mockResolvedValue({ ok: true }),
  piSessionSetActiveTools: vi.fn().mockResolvedValue({ ok: true }),
  piSessionFindByScope: vi.fn(),
}));
const registryTools = vi.hoisted(() => ({
  current: [
    {
      name: "write_content",
      description: "修改",
      parameters: {},
      risk: "write",
      source: "content-edit-tools",
      enabled: true,
    },
  ] as Array<Record<string, unknown>>,
}));
vi.mock("@/agent/toolRegistryAgentTools", () => ({
  getToolRegistryAgentTools: () => registryTools.current,
}));
vi.mock("@/agent/desktopSkillAdapter", () => ({ resolveAgentSkills: vi.fn() }));
vi.mock("@/services/piToolBridge", () => ({
  initPiToolBridge: vi.fn(),
  registerPiToolSessionContext: vi.fn(),
  unregisterPiToolSessionContext: vi.fn(),
}));

const chatId = "chat-11";
const options = {
  chatScope: "main-chat",
  chatId,
  sessionFile: "f_chat-11.jsonl",
  provider: {
    id: "provider-1",
    name: "测试服务商",
    baseUrl: "http://localhost",
    apiKey: "",
    api: "openai-completions",
    models: [],
  },
  model: { id: "model-1", reasoning: true, input: ["text"] },
  systemPrompt: "提示词",
  thinkingLevel: "high",
} as EnsureChatSessionOptions;

describe("pi 会话收养", () => {
  it("收养时不把旧服务的工具授权移交给同名的新服务", async () => {
    const previous = registryTools.current;
    const spec = {
      name: "remote",
      description: "查询",
      parameters: {},
      source: "mcp",
      risk: "execute" as const,
      executionIdentity: "old-endpoint",
    };
    registryTools.current = [
      { ...spec, enabled: true, executionIdentity: "new-endpoint", execute: vi.fn() },
    ];
    vi.mocked(piSessionFindByScope).mockResolvedValueOnce({
      ok: true,
      sessionId: "old-host",
      modelRef: { providerId: options.provider.id, modelId: options.model.id },
      thinkingLevel: options.thinkingLevel,
      toolSpecs: [spec],
    });
    await piChatSessionManager.adoptOrResolveSession("main-chat", "changed-server");
    expect(registerPiToolSessionContext).toHaveBeenCalledWith(
      "old-host",
      expect.objectContaining({ sessionTools: [] })
    );
    const ensured = await piChatSessionManager.ensureChatSession({
      ...options,
      chatId: "changed-server",
    });
    expect(ensured.sessionId).not.toBe("old-host");
    expect(piSessionDispose).toHaveBeenCalledWith("old-host");
    registryTools.current = previous;
  });
  it("宿主创建前捕获执行器，等待期间页面注销不丢失作用域工具", async () => {
    const original = registryTools.current;
    const execute = vi.fn(async () => "PDF A");
    registryTools.current = [
      {
        name: "pdf_search",
        description: "查询",
        parameters: {},
        source: "pdf-a",
        enabled: true,
        risk: "read",
        execute,
      },
    ];
    let complete!: (value: any) => void;
    vi.mocked(piSessionCreate).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const opening = piChatSessionManager.ensureChatSession({
      ...options,
      chatId: "scope-creation",
      toolScope: "pdf-a",
    });
    registryTools.current = [];
    complete({ ok: true });
    await opening;
    expect(registerPiToolSessionContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sessionTools: [expect.objectContaining({ name: "pdf_search", executor: execute })],
      })
    );
    registryTools.current = original;
  });
  it("不同数据库的相同对话 ID 不复用宿主", async () => {
    const a = await piChatSessionManager.ensureChatSession({ ...options, databaseName: "a" });
    const b = await piChatSessionManager.ensureChatSession({ ...options, databaseName: "b" });
    expect(a.sessionId).not.toBe(b.sessionId);
  });
  afterEach(async () => {
    await piChatSessionManager.disposeAll();
    vi.clearAllMocks();
  });

  it("恢复模型身份后继续复用同一宿主，会话授权不会因渲染层重载而丢失", async () => {
    vi.mocked(piSessionFindByScope).mockResolvedValue({
      ok: true,
      sessionId: "existing-session",
      modelRef: { providerId: "provider-1", modelId: "model-1" },
      thinkingLevel: "high",
    });
    await piChatSessionManager.adoptOrResolveSession("main-chat", chatId);
    expect((await piChatSessionManager.ensureChatSession(options)).sessionId).toBe(
      "existing-session"
    );
    expect(piSessionCreate).not.toHaveBeenCalled();
    expect(piSessionDispose).not.toHaveBeenCalled();
    expect(piSessionSetSystemPrompt).toHaveBeenCalledWith("existing-session", "提示词");
  });

  it("新交互会话声明交互能力并携带工具风险与来源", async () => {
    await piChatSessionManager.ensureChatSession(options);
    expect(piSessionCreate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        interactive: true,
        // 会话内容由 pi 从会话文件恢复：传对话 id 与文件名，不再灌历史
        piSessionId: chatId,
        sessionFile: "f_chat-11.jsonl",
        customTools: [expect.objectContaining({ risk: "write", source: "content-edit-tools" })],
        activeToolNames: ["write_content"],
      })
    );
  });
});

/**
 * 工具定义渲染在请求最前，增删改动会整条作废提示缓存，所以：全集按名字排序定死顺序；
 * 启用/停用已注册工具只切活跃集（不重建、保留本会话授权）；只有新定义才重建。
 */
describe("pi 会话工具集同步", () => {
  const tool = (name: string, enabled = true, description = name) => ({
    name,
    description,
    parameters: {},
    risk: "read",
    source: "mcp",
    enabled,
  });

  afterEach(async () => {
    await piChatSessionManager.disposeAll();
    registryTools.current = [tool("write_content")];
    vi.clearAllMocks();
  });

  it("全集按名字排序，注册表顺序（MCP 异步连接先后）不影响请求前缀", async () => {
    registryTools.current = [tool("zeta"), tool("alpha"), tool("mid")];
    await piChatSessionManager.ensureChatSession(options);
    expect(vi.mocked(piSessionCreate).mock.calls[0][1].customTools?.map(spec => spec.name)).toEqual(
      ["alpha", "mid", "zeta"]
    );
  });

  it("停用已注册工具只切活跃集，不重建会话", async () => {
    registryTools.current = [tool("alpha"), tool("beta")];
    const { sessionId } = await piChatSessionManager.ensureChatSession(options);
    vi.mocked(piSessionCreate).mockClear();

    registryTools.current = [tool("alpha"), tool("beta", false)];
    expect((await piChatSessionManager.ensureChatSession(options)).sessionId).toBe(sessionId);
    expect(piSessionSetActiveTools).toHaveBeenCalledWith(sessionId, ["alpha"]);
    expect(piSessionCreate).not.toHaveBeenCalled();
    expect(piSessionDispose).not.toHaveBeenCalled();
  });

  it("活跃集没变不推送，避免每轮白丢提示缓存", async () => {
    registryTools.current = [tool("alpha")];
    await piChatSessionManager.ensureChatSession(options);
    await piChatSessionManager.ensureChatSession(options);
    expect(piSessionSetActiveTools).not.toHaveBeenCalled();
  });

  it("出现新工具定义（新连 MCP 服务器）时重建会话——pi 注册表装配后不可追加", async () => {
    registryTools.current = [tool("alpha")];
    const { sessionId: first } = await piChatSessionManager.ensureChatSession(options);
    vi.mocked(piSessionCreate).mockClear();

    registryTools.current = [tool("alpha"), tool("newcomer")];
    const { sessionId: second } = await piChatSessionManager.ensureChatSession(options);
    expect(second).not.toBe(first);
    expect(piSessionDispose).toHaveBeenCalledWith(first);
    expect(piSessionCreate).toHaveBeenCalledWith(
      second,
      expect.objectContaining({ activeToolNames: ["alpha", "newcomer"] })
    );
    expect(piSessionSetActiveTools).not.toHaveBeenCalled();
  });

  it("schema/描述变化（MCP 服务器升级）同样重建", async () => {
    registryTools.current = [tool("alpha", true, "旧说明")];
    const { sessionId: first } = await piChatSessionManager.ensureChatSession(options);
    registryTools.current = [tool("alpha", true, "新说明")];
    expect((await piChatSessionManager.ensureChatSession(options)).sessionId).not.toBe(first);
  });
});

describe("宿主被主进程回收后（M4-e）", () => {
  afterEach(async () => {
    await piChatSessionManager.disposeAll();
    vi.clearAllMocks();
  });

  it("本地描述还在但宿主已不在：下一次 ensure 从会话文件重建，不报「会话不存在」", async () => {
    const { sessionId: first } = await piChatSessionManager.ensureChatSession(options);
    vi.mocked(piSessionSetSystemPrompt).mockResolvedValueOnce({ ok: false, error: "会话不存在" });

    const { sessionId } = await piChatSessionManager.ensureChatSession(options);

    expect(sessionId).not.toBe(first);
    expect(vi.mocked(piSessionCreate).mock.calls.at(-1)?.[1]).toMatchObject({
      sessionFile: "f_chat-11.jsonl",
    });
    // 已经不存在的宿主不再去 dispose
    expect(piSessionDispose).not.toHaveBeenCalledWith(first);
  });
});

describe("额外工具的风险声明", () => {
  it("未声明风险的注册表工具按 execute 交给宿主", async () => {
    registryTools.current = [
      { name: "unknown", description: "未知工具", parameters: {}, enabled: true, source: "test" },
    ];
    await piChatSessionManager.ensureChatSession(options);
    expect(vi.mocked(piSessionCreate).mock.calls.at(-1)?.[1].customTools?.[0].risk).toBe("execute");
  });
  afterEach(async () => {
    await piChatSessionManager.disposeAll();
    vi.clearAllMocks();
  });

  it("浏览器扩展传入的额外工具按 read 声明（否则不可交互会话在手动确认模式下全部被拒）", async () => {
    await piChatSessionManager.ensureChatSession({
      ...options,
      interactive: false,
      additionalTools: [
        {
          type: "function",
          function: { name: "get_page_content", description: "读页面", parameters: {} },
        },
      ],
    });
    const specs = vi.mocked(piSessionCreate).mock.calls[0][1].customTools as Array<{
      name: string;
      risk?: string;
    }>;
    expect(specs.find(spec => spec.name === "get_page_content")?.risk).toBe("read");
  });
});
