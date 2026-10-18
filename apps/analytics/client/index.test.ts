import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsClient, type AnalyticsState, type AnalyticsStorage } from "./index";
import type { EventBatch, EventContext } from "../contracts";

let now: number;
let context: EventContext;
beforeEach(() => {
  now = Date.parse("2026-10-18T12:00:00Z");
  context = { app_version: "0.59.0", os: "darwin", arch: "arm64", locale: "zh-CN" };
});
function setup(initial: unknown = null, legacy: string | null = null) {
  let saved = structuredClone(initial);
  const requests: EventBatch[] = [];
  const storage: AnalyticsStorage = {
    read: async () => structuredClone(saved),
    write: vi.fn(async state => {
      saved = structuredClone(state);
    }),
    legacyInstallationId: async () => legacy,
  };
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body)) as EventBatch;
    requests.push(input);
    return Response.json({
      data: {
        accepted: input.events.map(event => event.event_id),
        rejected: [],
        received_at: new Date(now).toISOString(),
        optional_future_field: true,
      },
    });
  });
  const client = new AnalyticsClient({
    endpoint: "https://analytics.test/v1/events/batch",
    environment: "production",
    context: () => context,
    storage,
    id: randomUUID,
    fetch: transport as typeof fetch,
    now: () => now,
  });
  return { client, storage, transport, requests, saved: () => saved as AnalyticsState };
}

describe("离线埋点客户端", () => {
  it("沿用旧安装标识；新会话、事件时点上下文和事件ID跨补报保留", async () => {
    const legacy = randomUUID();
    const first = setup(null, legacy);
    expect(await first.client.initialize()).toBe(false);
    await first.client.track("session_start", { first_run: false });
    const queued = first.saved().queue[0];
    context = { ...context, app_version: "0.60.0" };
    now += 3600000;
    const restarted = setup(first.saved());
    expect(await restarted.client.initialize()).toBe(false);
    await restarted.client.track("app_ready", { startup_ms: 100 });
    await restarted.client.flush();
    const sent = restarted.requests[0];
    expect(sent.installation_id).toBe(legacy);
    expect(sent.events[0]).toEqual(queued);
    expect(sent.events[0].context.app_version).toBe("0.59.0");
    expect(sent.events[1].context.app_version).toBe("0.60.0");
    expect(sent.events[1].session_id).not.toBe(queued.session_id);
    expect(restarted.saved().queue).toEqual([]);
  });

  it("生成全新安装，串行持久化完成前不能发请求", async () => {
    const fixture = setup();
    expect(await fixture.client.initialize()).toBe(true);
    await fixture.client.track("session_start", { first_run: true });
    let release: () => void = () => {
      throw new Error("持久化等待尚未初始化");
    };
    const waiting = new Promise<void>(resolve => {
      release = resolve;
    });
    const write = vi.spyOn(fixture.storage, "write").mockImplementationOnce(() => waiting);
    const flush = fixture.client.flush();
    await Promise.resolve();
    expect(fixture.transport).not.toHaveBeenCalled();
    release();
    await flush;
    expect(write).toHaveBeenCalled();
    expect(fixture.transport).toHaveBeenCalledTimes(1);
  });

  it("网络失败保留原ID、退避并共享并发flush，恢复后不会制造新事件", async () => {
    const fixture = setup();
    await fixture.client.initialize();
    await fixture.client.track("screen_view", { page: "home" });
    const original = fixture.saved().queue[0];
    fixture.transport.mockRejectedValueOnce(new Error("offline"));
    const first = fixture.client.flush();
    expect(fixture.client.flush()).toBe(first);
    await expect(first).rejects.toThrow("offline");
    await fixture.client.flush();
    expect(fixture.transport).toHaveBeenCalledTimes(1);
    expect(fixture.saved().queue[0]).toEqual(original);
    now += 21000;
    await fixture.client.flush();
    expect(fixture.requests[0].events[0]).toEqual(original);
    expect(fixture.saved().queue).toEqual([]);
  });

  it("坏事件独立移除、可重试事件保留，不阻塞后续批次", async () => {
    const fixture = setup();
    await fixture.client.initialize();
    for (let i = 0; i < 55; i++) await fixture.client.track("screen_view", { page: `page-${i}` });
    const queued = fixture.saved().queue;
    fixture.transport.mockImplementationOnce(async (_url, init) => {
      const input = JSON.parse(String(init?.body)) as EventBatch;
      return Response.json({
        data: {
          accepted: input.events.slice(2).map(event => event.event_id),
          rejected: [
            {
              index: 0,
              event_id: input.events[0].event_id,
              code: "UNSUPPORTED_EVENT",
              retryable: true,
            },
            { index: 1, event_id: input.events[1].event_id, code: "EVENT_TIME", retryable: false },
          ],
        },
      });
    });
    await fixture.client.flush();
    expect(fixture.transport).toHaveBeenCalledTimes(2);
    expect(fixture.saved().queue.map(event => event.event_id)).toEqual([queued[0].event_id]);
  });

  it("存储失败时不发送；重试后成功；拒绝未登记属性和未来队列版本", async () => {
    const fixture = setup();
    await fixture.client.initialize();
    await fixture.client.track("screen_view", { page: "home" });
    vi.spyOn(fixture.storage, "write").mockRejectedValueOnce(new Error("disk-full"));
    await expect(fixture.client.flush()).rejects.toThrow("disk-full");
    expect(fixture.transport).not.toHaveBeenCalled();
    now += 21000;
    await fixture.client.flush();
    expect(fixture.transport).toHaveBeenCalledTimes(1);
    expect(await fixture.client.track("screen_view", { page: "home", content: "正文" })).toBe(
      false
    );
    await expect(setup({ schema_version: 2 }).client.initialize()).rejects.toThrow("版本不受支持");
  });

  it("过期事件清理，回执缺少事件时保留原始队列", async () => {
    const fixture = setup();
    await fixture.client.initialize();
    await fixture.client.track("screen_view", { page: "home" });
    fixture.transport.mockResolvedValueOnce(
      Response.json({ data: { accepted: [], rejected: [] } })
    );
    await expect(fixture.client.flush()).rejects.toThrow("缺少事件");
    expect(fixture.saved().queue).toHaveLength(1);
    now += 8 * 86400000;
    await fixture.client.flush();
    expect(fixture.saved().queue).toEqual([]);
    await fixture.client.track("screen_view", { page: "new" });
    expect(fixture.saved().queue).toHaveLength(1);
    expect(fixture.saved().queue[0].properties.page).toBe("new");
  });
});
