import { afterEach, describe, expect, it, vi } from "vitest";
import { piChatSessionManager, type EnsureChatSessionOptions } from "../piChatSession";
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

const options = {
  chatScope: "main-chat",
  chatId: 11,
  provider: {
    id: "provider-1",
    name: "测试服务商",
    baseUrl: "http://localhost",
    apiKey: "",
    api: "openai-completions",
    models: [],
  },
  model: { id: "model-1", reasoning: true, input: ["text"] },
  history: [],
  systemPrompt: "提示词",
  thinkingLevel: "high",
} as EnsureChatSessionOptions;

describe("pi 会话收养", () => {
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
    await piChatSessionManager.adoptOrResolveSession("main-chat", 11);
    expect(await piChatSessionManager.ensureChatSession(options)).toBe("existing-session");
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
    const sessionId = await piChatSessionManager.ensureChatSession(options);
    vi.mocked(piSessionCreate).mockClear();

    registryTools.current = [tool("alpha"), tool("beta", false)];
    expect(await piChatSessionManager.ensureChatSession(options)).toBe(sessionId);
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
    const first = await piChatSessionManager.ensureChatSession(options);
    vi.mocked(piSessionCreate).mockClear();

    registryTools.current = [tool("alpha"), tool("newcomer")];
    const second = await piChatSessionManager.ensureChatSession(options);
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
    const first = await piChatSessionManager.ensureChatSession(options);
    registryTools.current = [tool("alpha", true, "新说明")];
    expect(await piChatSessionManager.ensureChatSession(options)).not.toBe(first);
  });
});
