import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InlineSuggestionRequest } from "@/types/inline-suggestions";
import {
  createInlineSuggestionService,
  parseInlineSuggestionRequest,
} from "../inline-suggestions-service";

const model = { providerId: "configured", modelId: "test-model" };
const request = (overrides: Partial<InlineSuggestionRequest> = {}): InlineSuggestionRequest => ({
  ...model,
  requestId: randomUUID(),
  shared: false,
  before: "function f() { return ",
  after: "; }",
  language: "typescript",
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe("行内建议的压力与隔离", () => {
  it("阻塞服务商时拒绝 1000 个额外请求，取消立即返回且不会释放尚占用的请求额度", async () => {
    const work: Array<{ signal: AbortSignal; finish(): void }> = [];
    const service = createInlineSuggestionService(
      (_, signal) =>
        new Promise(resolve => {
          work.push({ signal, finish: () => resolve({ ok: true, text: '{"text":"true"}' }) });
        })
    );
    service.configure(model, true);
    const initial = Array.from({ length: 4 }, (_, sender) => {
      const input = request({ shared: sender === 0 });
      return { sender, input, result: service.suggest(sender, input) };
    });
    await Promise.resolve();
    expect(work).toHaveLength(4);
    expect(service.cancel(1, initial[0].input.requestId)).toBe(false);
    service.configure(model, false);
    await expect(initial[0].result).resolves.toBeNull();
    expect(work[0].signal.aborted).toBe(true);

    const flood = await Promise.all(
      Array.from({ length: 1000 }, (_, sender) => service.suggest(sender + 10, request()))
    );
    expect(flood.every(value => value === null)).toBe(true);
    expect(work).toHaveLength(4);
    initial.slice(1).forEach(({ sender }) => service.disconnect(sender));
    await expect(Promise.all(initial.map(entry => entry.result))).resolves.toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(work.every(entry => entry.signal.aborted)).toBe(true);
    work.forEach(entry => entry.finish());
    await vi.waitFor(async () => {
      const result = service.suggest(99, request());
      await Promise.resolve();
      expect(work).toHaveLength(5);
      work[4].finish();
      await expect(result).resolves.toBe("true");
    });
  });

  it("限时取消、禁止未授权共享、隔离新旧模型并保留合法空格", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const complete = vi.fn(async (_request: unknown, signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 1)
        await new Promise<void>(resolve =>
          signal.addEventListener("abort", () => resolve(), { once: true })
        );
      return { ok: true, text: "使用无效结果" };
    });
    const service = createInlineSuggestionService(complete);
    const denied = request({ shared: true });
    await expect(service.suggest(1, request())).resolves.toBeNull();
    service.configure(model, false);
    await expect(service.suggest(1, denied)).resolves.toBeNull();
    expect(complete).not.toHaveBeenCalled();

    const timed = service.suggest(1, request());
    await vi.advanceTimersByTimeAsync(8000);
    expect(signals[0].aborted).toBe(true);
    await expect(timed).resolves.toBeNull();
    complete.mockResolvedValue({ ok: true, text: ' ```json\n{"text":" result"}\n``` ' });
    await expect(service.suggest(1, request())).resolves.toBe(" result");

    service.configure({ ...model, modelId: "new" }, true);
    await expect(service.suggest(1, request())).resolves.toBeNull();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(parseInlineSuggestionRequest(request({ before: "x".repeat(513) }))).toBeNull();
    expect(parseInlineSuggestionRequest(request())).toEqual(expect.objectContaining({ ...model }));
  });

  it("同一窗口 500 轮抢占后只保留最新响应，乱序取消不能取消新请求", async () => {
    const service = createInlineSuggestionService(async (_, signal) => {
      await new Promise<void>(resolve => queueMicrotask(resolve));
      return { ok: !signal.aborted, text: '{"text":"ok"}' };
    });
    service.configure(model, true);
    for (let round = 0; round < 500; round++) {
      const old = request();
      const fresh = request();
      const oldResult = service.suggest(1, old);
      const freshResult = service.suggest(1, fresh);
      expect(service.cancel(1, old.requestId)).toBe(false);
      await expect(oldResult).resolves.toBeNull();
      await expect(freshResult).resolves.toBe("ok");
    }
  });
});
