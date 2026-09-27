import { afterEach, describe, expect, it, vi } from "vitest";
import { piChatSessionManager, type EnsureChatSessionOptions } from "../piChatSession";
import {
  piSessionCreate,
  piSessionDispose,
  piSessionFindByScope,
  piSessionSetSystemPrompt,
} from "@/commands/piSession";

vi.mock("@/commands/piSession", () => ({
  piSessionCreate: vi.fn().mockResolvedValue({ ok: true }),
  piSessionDispose: vi.fn().mockResolvedValue({ ok: true }),
  piSessionSetSystemPrompt: vi.fn().mockResolvedValue({ ok: true }),
  piSessionFindByScope: vi.fn(),
}));
vi.mock("@/agent/toolRegistryAgentTools", () => ({
  getToolRegistryAgentTools: () => [
    {
      name: "write_content",
      description: "修改",
      parameters: {},
      risk: "write",
      source: "content-edit-tools",
    },
  ],
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
      })
    );
  });
});
