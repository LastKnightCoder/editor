import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionClient, type AnalyticsState, type AnalyticsStorage } from "./index";
import type { VersionReport } from "../contracts";

let now: number;
beforeEach(() => {
  now = Date.parse("2026-10-24T12:00:00Z");
});
function setup(initial: unknown = null) {
  let saved = structuredClone(initial);
  const requests: VersionReport[] = [];
  const storage: AnalyticsStorage = {
    read: async () => structuredClone(saved),
    write: vi.fn(async state => {
      saved = structuredClone(state);
    }),
  };
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const report = JSON.parse(String(init?.body)) as VersionReport;
    requests.push(report);
    return Response.json({
      data: { app_version: report.app_version, reported_at: report.reported_at },
    });
  });
  const client = new VersionClient({
    endpoint: "https://analytics.test/v1/versions",
    environment: "production",
    storage,
    id: randomUUID,
    fetch: transport as typeof fetch,
    now: () => now,
  });
  return { client, storage, transport, requests, saved: () => saved as AnalyticsState };
}

describe("最小版本上报", () => {
  it("每天同版本只发送一次，跨重启保持去重且不携带行为和设备上下文", async () => {
    const f = setup();
    await f.client.initialize();
    await Promise.all([f.client.report("0.59.2"), f.client.report("0.59.2")]);
    await f.client.report("0.59.2");
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.requests[0]).toEqual({
      schema_version: 1,
      product: "tau-desktop",
      environment: "production",
      installation_id: f.saved().installation_id,
      app_version: "0.59.2",
      reported_at: new Date(now).toISOString(),
    });
    const restarted = setup(f.saved());
    await restarted.client.initialize();
    await restarted.client.report("0.59.2");
    expect(restarted.transport).not.toHaveBeenCalled();
  });

  it("升级时重新上报，上海自然日变化后首次启动再次上报", async () => {
    const f = setup();
    await f.client.initialize();
    await f.client.report("0.59.2");
    now += 1000;
    await f.client.report("0.59.3");
    now = Date.parse("2026-10-24T16:00:00Z");
    await f.client.report("0.59.3");
    expect(f.transport).toHaveBeenCalledTimes(3);
    expect(f.requests.map(report => report.app_version)).toEqual(["0.59.2", "0.59.3", "0.59.3"]);
  });

  it("旧状态只保留安装标识并清除所有行为队列，不再读取更早的遥测文件", async () => {
    const installation_id = randomUUID();
    const f = setup({
      schema_version: 1,
      installation_id,
      queue: [{ name: "screen_view", properties: { page: "chat" } }],
    });
    await f.client.initialize();
    expect(f.saved()).toEqual({
      schema_version: 2,
      installation_id,
      confirmed: null,
      pending: null,
    });
    await f.client.report("0.59.2");
    expect(f.requests[0].installation_id).toBe(installation_id);
    expect(JSON.stringify(f.saved())).not.toContain("screen_view");
  });

  it("离线重启后只补报当前版本，重试使用相同观测时点", async () => {
    const f = setup();
    await f.client.initialize();
    f.transport.mockRejectedValueOnce(new Error("offline"));
    await expect(f.client.report("0.59.2")).rejects.toThrow("offline");
    const pending = structuredClone(f.saved().pending);
    await f.client.report("0.59.2");
    expect(f.requests[0].reported_at).toBe(pending?.reported_at);
    expect(f.saved().pending).toBeNull();
    const restarted = setup({
      ...f.saved(),
      pending: { app_version: "0.58.0", reported_at: new Date(now - 86400000).toISOString() },
      confirmed: null,
    });
    await restarted.client.initialize();
    await restarted.client.report("0.59.3");
    expect(restarted.requests).toHaveLength(1);
    expect(restarted.requests[0].app_version).toBe("0.59.3");
  });

  it("正文落盘失败时不发送，确认落盘失败时仍保留待补报状态", async () => {
    const f = setup();
    await f.client.initialize();
    vi.mocked(f.storage.write).mockRejectedValueOnce(new Error("disk-full"));
    await expect(f.client.report("0.59.2")).rejects.toThrow("disk-full");
    expect(f.transport).not.toHaveBeenCalled();
    vi.mocked(f.storage.write)
      .mockImplementationOnce(async state => {})
      .mockRejectedValueOnce(new Error("confirm-failed"));
    await expect(f.client.report("0.59.2")).rejects.toThrow("confirm-failed");
    await f.client.report("0.59.2");
    expect(f.transport).toHaveBeenCalledTimes(2);
    expect(f.saved().confirmed?.app_version).toBe("0.59.2");
  });

  it("失败或不匹配回执不能将当天版本标为已上报", async () => {
    const f = setup();
    await f.client.initialize();
    f.transport.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    await expect(f.client.report("0.59.2")).rejects.toThrow("429");
    f.transport.mockResolvedValueOnce(Response.json({ data: { app_version: "other" } }));
    await expect(f.client.report("0.59.2")).rejects.toThrow("回执无效");
    expect(f.saved().confirmed).toBeNull();
  });

  it("拒绝损坏和未来的本地状态，不覆盖为新安装", async () => {
    for (const value of [
      { schema_version: 3, installation_id: randomUUID() },
      { schema_version: 2, installation_id: randomUUID(), confirmed: {}, pending: null },
      { schema_version: "1", installation_id: randomUUID() },
      {
        schema_version: 2,
        installation_id: randomUUID(),
        confirmed: null,
        pending: { app_version: "0.59.2", reported_at: new Date(now).toISOString(), page: "chat" },
      },
    ]) {
      const f = setup(value);
      await expect(f.client.initialize()).rejects.toThrow("状态格式无效");
      expect(f.storage.write).not.toHaveBeenCalled();
    }
  });
});
