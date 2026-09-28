import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ assemble: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../database", () => ({ default: { onDatabaseConnected: vi.fn() } }));
vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: async () => ({ database: { active: "review" } }),
    onSettingChanged: vi.fn(),
  },
}));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => "/tmp/pi-host-test" } }));
vi.mock("../pi-session-host-core", () => ({
  createHostModelRuntime: async () => ({}),
  assembleHostSession: (...args: unknown[]) => mocks.assemble(...args),
  resolveAgentShellPath: () => ({}),
  createDisplayEntryWriter: () => ({ expect: vi.fn(), discard: vi.fn(), dispose: vi.fn() }),
}));
import Host from "../pi-session-host";
const client = { isDestroyed: () => false, send: vi.fn(), once: vi.fn(), removeListener: vi.fn() };
const request = (sessionId: string) => ({
  sessionId,
  scope: "main-chat:chat",
  cwd: "/tmp",
  modelRef: { providerId: "p", modelId: "m" },
  sessionFile: "chat.jsonl",
  piSessionId: "chat",
});
const session = () => ({
  sessionFile: "/tmp/pi-host-test/sessions/review/chat.jsonl",
  sessionId: "chat",
  agent: {},
  isStreaming: false,
  isCompacting: false,
  subscribe: () => () => {},
  abort: vi.fn(async () => {}),
  dispose: vi.fn(),
  prompt: vi.fn(async () => {}),
  clearQueue: () => ({ steering: [], followUp: [] }),
});
afterEach(async () => {
  await Host.dispose("first");
  await Host.dispose("second");
  mocks.assemble.mockReset();
  vi.unstubAllGlobals();
});
it("装配挂起期间第二个同文件创建被拒绝", async () => {
  let release!: (value: unknown) => void;
  mocks.assemble.mockImplementation(() => new Promise(resolve => (release = resolve)));
  const first = Host.create(client, request("first"));
  await vi.waitFor(() => expect(mocks.assemble).toHaveBeenCalledOnce());
  expect((await Host.create(client, request("second"))).ok).toBe(false);
  release(session());
  expect((await first).ok).toBe(true);
});
it("图片下载期间释放会话，会取消准备且不再提交 prompt", async () => {
  const hosted = session();
  mocks.assemble.mockResolvedValue(hosted);
  await Host.create(client, request("first"));
  const fetcher = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new Error("已中止")), { once: true });
      })
  );
  vi.stubGlobal("fetch", fetcher);
  const prompt = Host.prompt("first", "看图", [{ path: "https://example.invalid/a.png" }]);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  await Host.dispose("first");
  expect((await prompt).ok).toBe(false);
  expect(hosted.prompt).not.toHaveBeenCalled();
  expect(hosted.dispose).toHaveBeenCalledOnce();
});
