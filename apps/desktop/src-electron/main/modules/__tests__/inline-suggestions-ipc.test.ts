import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";

type Handler = (event: unknown, payload: unknown) => unknown;

const mocks = vi.hoisted(() => {
  const model = { providerId: "assigned", modelId: "model" };
  return {
    model,
    handle: vi.fn<(channel: string, handler: Handler) => void>(),
    complete: vi.fn(),
    onSettingChanged: vi.fn(() => () => undefined),
    setting: {
      llmProviders: [{ id: model.providerId, models: [{ id: model.modelId }] }],
      llmUsageSettings: { inlineSuggestion: model },
      inlineSuggestionShared: true,
    },
  };
});
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("../pi-ai-runtime", () => ({ default: { complete: mocks.complete } }));
vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: async () => mocks.setting,
    onSettingChanged: mocks.onSettingChanged,
  },
}));

import inlineSuggestions from "../inline-suggestions";

it("IPC 按设置选择模型，隔离窗口取消并在进程退出时取消", async () => {
  await inlineSuggestions.init();
  const handlers = new Map(mocks.handle.mock.calls);
  const request = handlers.get("inline-suggestions:request");
  const cancel = handlers.get("inline-suggestions:cancel");
  if (!request || !cancel) throw new Error("行内建议 IPC 未注册");
  const makeSender = (id: number) =>
    Object.assign(new EventEmitter(), { id, isDestroyed: () => false });
  const sender = makeSender(1);
  const payload = {
    ...mocks.model,
    shared: true,
    before: "草稿",
    after: "",
    requestId: randomUUID(),
  };
  mocks.complete.mockResolvedValueOnce({ ok: true, text: '{"text":"建议"}' });
  await expect(request({ sender }, { ...payload, modelId: "unassigned" })).resolves.toBeNull();
  await expect(request({ sender }, payload)).resolves.toBe("建议");
  expect(mocks.complete.mock.calls[0][0]).toMatchObject({
    ...mocks.model,
    source: { feature: "inlineSuggestion" },
  });
  mocks.complete.mockImplementationOnce(
    (_, signal: AbortSignal) =>
      new Promise(resolve =>
        signal.addEventListener("abort", () => resolve({ ok: false }), { once: true })
      )
  );
  const pendingId = randomUUID();
  const pending = request({ sender }, { ...payload, requestId: pendingId });
  await Promise.resolve();
  expect(cancel({ sender: makeSender(2) }, pendingId)).toBe(false);
  sender.emit("render-process-gone");
  await expect(pending).resolves.toBeNull();
  expect(mocks.complete.mock.calls[1][1].aborted).toBe(true);
});
