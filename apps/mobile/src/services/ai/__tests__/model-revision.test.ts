// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { AiError } from "@tau/ai/contracts";
import { createMobileAiService } from "../service";
import * as native from "../native";

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
afterEach(() => vi.resetAllMocks());

it("插件授权的模型修订透传原生冻结入口，修订冲突时不请求模型也不降级重试", async () => {
  const lease = { leaseId: "test-lease", databaseName: "one.db", generation: 1 };
  vi.mocked(native.acquireLibrary).mockResolvedValue(lease);
  vi.mocked(native.assertLibrary).mockResolvedValue(lease);
  vi.mocked(native.setRunActive).mockResolvedValue(undefined);
  vi.mocked(native.releaseLibrary).mockResolvedValue(undefined);
  const fetch = vi.fn(async () => new Response("不应请求"));
  vi.mocked(native.createModelFetch).mockImplementation(
    async (_lease, _provider, _model, expectedRevision) => {
      if (expectedRevision !== "current-provider-digest")
        throw new AiError("AI_CONFIG_CHANGED", "提供方配置在授权后已变化");
      return {
        fetch,
        dispose: async () => undefined,
        config: {
          llmProviders: [
            {
              id: "validation",
              name: "测试",
              api: "openai-completions",
              baseUrl: "https://validation.invalid/v1",
              models: [
                {
                  id: "validation-model",
                  reasoning: false,
                  input: ["text"],
                  contextWindow: 16000,
                  maxTokens: 1000,
                },
              ],
            },
          ],
          llmUsageSettings: {},
        },
      };
    }
  );
  const service = createMobileAiService();
  try {
    const handle = await service.generation.start({
      requestId: "generation-model-revision",
      databaseName: "one.db",
      model: { providerId: "validation", modelId: "validation-model" },
      expectedModelRevision: "approved-provider-digest",
      messages: [{ role: "user", content: "总结" }],
    });
    const result = await handle.result;
    expect(result.outcome).toBe("failed");
    expect(result.error?.code).toBe("AI_CONFIG_CHANGED");
    expect(result.error?.message).toContain("授权后已变化");
    expect(native.createModelFetch).toHaveBeenCalledExactlyOnceWith(
      lease,
      "validation",
      "validation-model",
      "approved-provider-digest"
    );
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await service.lifecycle.dispose();
  }
});
