import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), call: vi.fn() }));
vi.mock("@/electron", () => ({ on: mocks.on, off: mocks.off }));
vi.mock("@/commands/plugin-tts", () => ({ callPluginTTS: mocks.call }));
import { openPluginTTS } from "../plugin-tts";
it("无在途请求时也能收到关闭通知，并中止后续调用", async () => {
  mocks.call.mockImplementation(async (request: { kind: string }) =>
    request.kind === "open" ? { canClone: true, textInstructions: "plain" } : undefined
  );
  const task = await openPluginTTS(
    { id: "a", pluginId: "test.tts", name: "a", models: [], config: { key: "a" } },
    "model"
  );
  const session = mocks.call.mock.calls[0][0].session;
  const handler = mocks.on.mock.calls[0][1];
  handler(undefined, { session: "other" });
  expect(task.signal.aborted).toBe(false);
  handler(undefined, { session });
  expect(task.signal.aborted).toBe(true);
  await task.dispose();
  expect(mocks.off).toHaveBeenCalledWith("plugin-tts:session-closed", handler);
});
