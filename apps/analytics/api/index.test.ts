import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "./index";
import { testEnvironment } from "./testing";
import { cleanup } from "./cleanup";
import { queryWindow } from "./queries";
import { geolocation } from "./geo";

let fixture: ReturnType<typeof testEnvironment>;
const origin = "https://analytics.taunote.app";
beforeEach(() => {
  fixture = testEnvironment();
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-24T12:00:00Z");
});
afterEach(() => {
  fixture.sqlite.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const request = (
  pathname: string,
  init: RequestInit = {},
  cf: object = { country: "CN", regionCode: "ZJ" }
) => {
  const req = new Request(origin + pathname, init);
  Object.defineProperty(req, "cf", { value: cf });
  return handle(req, fixture.env);
};
const payload = (installation_id = randomUUID(), app_version = "0.59.2") => ({
  schema_version: 1,
  product: "tau-desktop",
  environment: "production",
  installation_id,
  app_version,
  reported_at: new Date().toISOString(),
});
const report = (input: unknown = payload(), headers: Record<string, string> = {}) =>
  request("/v1/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
const admin = async (path = "/v1/admin/overview") => {
  const response = await request(path, {
    headers: { Authorization: `Bearer ${fixture.env.ADMIN_TOKEN}` },
  });
  expect(response.status).toBe(200);
  return response.json();
};
const count = (table: string) =>
  fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;

describe("应用版本采集", () => {
  it("同安装每日只保留最新版本，重复和乱序上报不覆盖新版本，也不写旧事件表", async () => {
    const input = payload();
    const first = await report(input);
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({
      app_version: input.app_version,
      reported_at: input.reported_at,
    });
    await report(input);
    vi.setSystemTime(Date.now() + 1000);
    await report(payload(input.installation_id, "0.59.3"));
    await report(input);
    expect(count("installation_versions")).toBe(1);
    expect(
      fixture.sqlite.prepare("SELECT app_version FROM installation_versions").get()?.app_version
    ).toBe("0.59.3");
    for (const table of ["events", "sessions", "daily_events", "daily_activity", "installations"])
      expect(count(table)).toBe(0);
  });

  it("版本分布对窗口内每个安装只取最后一次观测，不重复累计跨日版本", async () => {
    vi.setSystemTime("2026-10-23T12:00:00Z");
    const installation = randomUUID();
    await report(payload(installation));
    vi.setSystemTime("2026-10-24T12:00:00Z");
    await report(payload(installation, "0.59.3"));
    await report(payload());
    expect((await admin()).data).toEqual({ reporting_installations: 2, download_starts: 0 });
    const versions = await admin("/v1/admin/breakdown?dimension=versions");
    expect(versions.data).toEqual([
      { key: "0.59.2", label: "0.59.2", count: 1 },
      { key: "0.59.3", label: "0.59.3", count: 1 },
    ]);
    expect(versions.meta).toMatchObject({ timezone: "Asia/Shanghai", metric_version: 2 });
    expect((await admin("/v1/admin/timeseries")).data.at(-1)).toMatchObject({
      reporting_installations: 2,
    });
  });

  it("拒绝额外行为/设备字段、无效版本/身份/时间、超大正文及越权来源", async () => {
    for (const change of [
      { schema_version: 2 },
      { installation_id: "bad" },
      { app_version: "invalid" },
      { reported_at: "2026-01-01T00:00:00Z" },
      { reported_at: "2026-10-24T13:00:00Z" },
      { startup_ms: 100 },
      { os: "darwin" },
    ])
      expect((await report({ ...payload(), ...change })).status).toBe(400);
    expect((await report({ ...payload(), note: "x".repeat(2048) })).status).toBe(413);
    expect((await report(payload(), { Origin: "https://evil.test" })).status).toBe(403);
    expect(count("installation_versions")).toBe(0);
  });

  it("限流和依赖缺失时拒绝版本写入", async () => {
    fixture.env.VERSION_LIMITER = { limit: async () => ({ success: false }) };
    expect((await report()).status).toBe(429);
    fixture.env.VERSION_LIMITER = undefined;
    expect((await report()).status).toBe(503);
    expect(count("installation_versions")).toBe(0);
  });

  it("旧行为接口直接410，不读取请求正文和数据库", async () => {
    const prepare = vi.spyOn(fixture.env.DB, "prepare");
    const req = new Request(origin + "/v1/events/batch", {
      method: "POST",
      body: JSON.stringify({ events: [{ name: "screen_view" }] }),
    });
    const reader = vi.spyOn(req.body!, "getReader");
    expect((await handle(req, fixture.env)).status).toBe(410);
    expect(reader).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("数据库写入失败不能确认版本上报成功", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(fixture.env.DB, "prepare").mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });
    expect((await report()).status).toBe(503);
    expect(count("installation_versions")).toBe(0);
  });

  it("升级只迁入历史版本观测并停用行为投影，不删除既有历史记录", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const name of ["0001_analytics.sql", "0002_versioned_projections.sql"])
        database.exec(
          readFileSync(new URL("../infra/migrations/" + name, import.meta.url), "utf8")
        );
      database.exec(
        "INSERT INTO daily_activity VALUES('tau-desktop','production','2026-10-18','installation',123,'0.59.0','darwin','arm64','CN','CN-33',5)"
      );
      database.exec(
        readFileSync(
          new URL("../infra/migrations/0003_minimal_versions.sql", import.meta.url),
          "utf8"
        )
      );
      expect(
        database.prepare("SELECT app_version,reported_at FROM installation_versions").get()
      ).toEqual({ app_version: "0.59.0", reported_at: 123 });
      expect(database.prepare("SELECT COUNT(*) AS n FROM daily_activity").get()?.n).toBe(1);
      expect(
        database
          .prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='project_event'")
          .get()
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });
});

describe("管理与保留范围", () => {
  it("管理认证、签名Cookie、过期与登出，秘密缺失时关闭访问", async () => {
    expect((await request("/v1/admin/overview")).status).toBe(401);
    const login = () =>
      request("/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ token: fixture.env.ADMIN_TOKEN }),
      });
    const response = await login();
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("HttpOnly; SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain(fixture.env.ADMIN_TOKEN);
    const headers = { Cookie: cookie.split(";")[0] };
    expect((await request("/v1/admin/session", { headers })).status).toBe(200);
    expect(
      (
        await request("/v1/admin/session", {
          headers: { Cookie: headers.Cookie.replace(/.$/, "X") },
        })
      ).status
    ).toBe(401);
    vi.setSystemTime(Date.now() + 9 * 3600000);
    expect((await request("/v1/admin/session", { headers })).status).toBe(401);
    expect(
      (await request("/v1/admin/logout", { method: "POST" })).headers.get("Set-Cookie")
    ).toContain("Max-Age=0");
    fixture.env.ADMIN_TOKEN = undefined;
    expect((await request("/v1/admin/session")).status).toBe(503);
  });

  it("移除行为查询和维度，继续拒绝SQL与无效日期", async () => {
    const headers = { Authorization: `Bearer ${fixture.env.ADMIN_TOKEN}` };
    for (const path of ["retention", "events"])
      expect((await request("/v1/admin/" + path, { headers })).status).toBe(404);
    for (const dimension of [
      "pages",
      "features",
      "events",
      "os",
      "provinces",
      "events;DROP TABLE events",
    ])
      expect(
        (
          await request(`/v1/admin/breakdown?dimension=${encodeURIComponent(dimension)}`, {
            headers,
          })
        ).status
      ).toBe(400);
    for (const query of [
      "from=2026-02-30",
      "to=bad",
      "from=2020-01-01",
      "from=2026-10-25",
      "environment=staging",
    ])
      expect((await request(`/v1/admin/overview?${query}`, { headers })).status).toBe(400);
    expect(() => queryWindow(new URL(origin + "?to=invalid"))).toThrow();
    const req = new Request(origin);
    Object.defineProperty(req, "cf", { value: { country: "CN", regionCode: "31" } });
    expect(geolocation(req).region_code).toBe("CN-31");
  });

  it("版本观测按400天有界清理，下载去重仍按7天清理", async () => {
    await report();
    expect(count("installation_versions")).toBe(1);
    vi.setSystemTime(Date.now() + 401 * 86400000);
    await cleanup(fixture.env);
    expect(count("installation_versions")).toBe(0);
  });
});

describe("R2下载发起", () => {
  const filename = "Tau-v0.59.0-darwin.dmg";
  const download = (init: RequestInit = {}, file = filename) =>
    request(`/v1/downloads/${file}?channel=website`, {
      ...init,
      headers: { "CF-Connecting-IP": "203.0.113.1", "User-Agent": "Mozilla/5.0", ...init.headers },
    });
  it("存在对象才跳转，下载按日近似去重并保存省份，文件仍走R2域名", async () => {
    fixture.objects.add(`desktop/${filename}`);
    const responses = await Promise.all(Array.from({ length: 10 }, () => download()));
    expect(responses.every(response => response.status === 302)).toBe(true);
    expect(responses[0].headers.get("Location")).toBe(`https://dl.taunote.app/desktop/${filename}`);
    expect(responses[0].headers.get("Cache-Control")).toBe("no-store");
    expect(count("download_receipts")).toBe(1);
    const row =
      fixture.sqlite.prepare("SELECT visitor_hash,region_code FROM download_receipts").get() ?? {};
    expect(String(row.visitor_hash)).toMatch(/^[a-f0-9]{64}$/);
    expect(row.region_code).toBe("CN-33");
    expect((await admin()).data.download_starts).toBe(1);
    expect((await admin("/v1/admin/breakdown?dimension=channels")).data).toEqual([
      { key: "website", label: "website", count: 1 },
    ]);
    vi.setSystemTime("2026-10-25T12:00:00Z");
    await download();
    expect(count("download_receipts")).toBe(2);
  });

  it("HEAD、分片、预取、机器人、缺IP/秘密不计数；统计失败仍可下载", async () => {
    fixture.objects.add(`desktop/${filename}`);
    const ignored: RequestInit[] = [
      { method: "HEAD" },
      { headers: { Range: "bytes=0-9" } },
      { headers: { Purpose: "prefetch" } },
      { headers: { "User-Agent": "Googlebot" } },
      { headers: { "CF-Connecting-IP": "" } },
    ];
    for (const init of ignored) expect((await download(init)).status).toBe(302);
    expect(count("download_receipts")).toBe(0);
    fixture.env.DOWNLOAD_HASH_KEY = undefined;
    expect((await download()).status).toBe(302);
    expect(count("download_receipts")).toBe(0);
    fixture.env.DOWNLOAD_HASH_KEY = "test-only-key-".repeat(4);
    fixture.sqlite.exec("DROP TABLE daily_downloads");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await download()).status).toBe(302);
    expect(count("download_receipts")).toBe(0);
  });

  it("不存在对象、跨平台扩展名、任意URL和路径穿越不通过", async () => {
    expect((await download()).status).toBe(404);
    for (const file of [
      "latest.yml",
      "Tau-v0.59.0-darwin.exe",
      "https%3A%2F%2Fevil.test",
      "..%2Ffile.dmg",
    ])
      expect((await download({}, file)).status).toBe(404);
    expect(count("download_receipts")).toBe(0);
  });
});
