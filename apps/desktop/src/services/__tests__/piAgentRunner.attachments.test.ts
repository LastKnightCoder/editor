import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";

const mocks = vi.hoisted(() => ({
  prompt: vi.fn(async () => ({ ok: false, error: "不应发送" })),
  dispose: vi.fn(async () => ({ ok: true })),
  download: vi.fn(),
}));
vi.mock("@/commands/piSession", () => ({
  piSessionCreate: async () => ({ ok: true }),
  piSessionAbort: async () => ({ ok: true }),
  piSessionDispose: mocks.dispose,
  piSessionPrompt: mocks.prompt,
  onPiSessionEvent: () => () => undefined,
}));
vi.mock("@/agent/toolRegistryAgentTools", () => ({ getToolRegistryAgentTools: () => [] }));
vi.mock("@/services/piToolBridge", () => ({
  initPiToolBridge: vi.fn(),
  registerPiToolSessionContext: vi.fn(),
  unregisterPiToolSessionContext: vi.fn(),
}));
vi.mock("@/services/piLLM", () => ({ toPiChatMessages: () => ({}) }));
vi.mock("../chatDatabase", () => ({ getChatDatabase: () => "test" }));
vi.mock("@/utils/resouce", () => ({ remoteResourceToLocal: mocks.download }));

import { runPiAgent } from "../piAgentRunner";

describe("一次性 pi 运行的附件准备", () => {
  it("准备远程文件期间取消，文件返回后仍不启动模型和工具", async () => {
    let complete!: (path: string) => void;
    mocks.download.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const handle = runPiAgent({
      provider: {
        id: "p",
        name: "测试",
        baseUrl: "https://example.test",
        apiKey: "",
        api: "openai-completions",
        models: [],
      },
      model: { id: "m", reasoning: false, input: ["text"] },
      messages: [
        {
          role: Role.User,
          content: [{ type: "file", file: "https://example.test/a.pdf", fileName: "a.pdf" }],
        },
      ],
    });
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalled());
    handle.abort();
    complete("/cached/a.pdf");
    expect(await handle.result).toMatchObject({ ok: false, aborted: true });
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
