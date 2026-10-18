import { randomUUID } from "node:crypto";
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
  vi.setSystemTime("2026-10-18T12:00:00Z");
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
const event = (name = "screen_view", properties: object = { page: "home" }) => ({
  event_id: randomUUID(),
  session_id: randomUUID(),
  name,
  event_version: 1,
  occurred_at: new Date().toISOString(),
  context: { app_version: "0.59.0", os: "darwin", arch: "arm64", locale: "zh-CN" },
  properties,
});
const batch = (
  events: unknown[] = [event()],
  installation_id = randomUUID(),
  environment = "production"
) => ({ schema_version: 1, product: "tau-desktop", environment, installation_id, events });
const ingest = (input: unknown, headers: Record<string, string> = {}) =>
  request("/v1/events/batch", {
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

describe("v1采集与投影", () => {
  it("固定v1契约、可选字段、默认事件版本及按条错误回执", async () => {
    const accepted = event();
    const future = { ...event(), name: "future_event" };
    const invalid = event("screen_view", { page: "home", note_content: "不允许采集" });
    const missingVersion = { ...event(), event_version: undefined };
    const input = {
      ...batch([accepted, future, invalid, missingVersion]),
      optional_future_field: true,
    };
    const response = await ingest(input);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.accepted).toEqual([accepted.event_id, missingVersion.event_id]);
    expect(data.rejected).toEqual([
      { index: 1, event_id: future.event_id, code: "UNSUPPORTED_EVENT", retryable: true },
      { index: 2, event_id: invalid.event_id, code: "EVENT_PROPERTIES", retryable: false },
    ]);
    expect(count("events")).toBe(2);
    const row = fixture.sqlite.prepare("SELECT country,region_code FROM events LIMIT 1").get();
    expect(row).toMatchObject({ country: "CN", region_code: "CN-33" });
  });

  it("并发重试只计一次，环境命名空间隔离，坏投影使整批回滚", async () => {
    const input = batch();
    const responses = await Promise.all(Array.from({ length: 20 }, () => ingest(input)));
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(count("events")).toBe(1);
    expect((await admin()).data).toMatchObject({ active_installations: 1, events: 1, sessions: 1 });
    await ingest({ ...input, environment: "development" });
    expect(count("events")).toBe(2);
    expect((await admin()).data.events).toBe(1);
    fixture.sqlite.exec("DROP TABLE daily_events");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await ingest(batch())).status).toBe(503);
    expect(count("events")).toBe(2);
    expect(count("installations")).toBe(2);
  });

  it("离线时间按上海自然日归属，跨日活跃不能相加为窗口去重", async () => {
    const id = randomUUID();
    const older = { ...event(), occurred_at: "2026-10-16T15:59:59Z" };
    const newer = { ...event(), occurred_at: "2026-10-16T16:00:00Z" };
    await ingest(batch([newer, older], id));
    const result = await admin("/v1/admin/timeseries?from=2026-10-16&to=2026-10-17");
    expect(
      result.data.map((row: { day: string; active_installations: number }) => [
        row.day,
        row.active_installations,
      ])
    ).toEqual([
      ["2026-10-16", 1],
      ["2026-10-17", 1],
    ]);
    expect((await admin()).data.active_installations).toBe(1);
    expect(result.meta).toMatchObject({ timezone: "Asia/Shanghai", metric_version: 1 });
  });

  it("迁入旧安装不是新增；累计心跳、乱序与退出只取最大值", async () => {
    const start = event("session_start", { first_run: false });
    const base = Date.now();
    const heartbeat = {
      ...event("heartbeat", { uptime_ms: 20000, active_ms: 10000 }),
      session_id: start.session_id,
      occurred_at: new Date(base + 20000).toISOString(),
    };
    const older = {
      ...event("heartbeat", { uptime_ms: 10000, active_ms: 5000 }),
      session_id: start.session_id,
      occurred_at: new Date(base + 10000).toISOString(),
    };
    const end = {
      ...event("session_end", { duration_ms: 30000, active_ms: 12000 }),
      session_id: start.session_id,
      occurred_at: new Date(base + 30000).toISOString(),
    };
    await ingest(batch([heartbeat, start, end, older]));
    expect((await admin()).data).toMatchObject({
      new_installations: 0,
      sessions: 1,
      foreground_ms: 12000,
    });
  });

  it("顺序迁移后，新事件版本的同名属性不能重新解释v1安装和时长", async () => {
    const start = event("session_start", { first_run: false });
    const heartbeat = {
      ...event("heartbeat", { uptime_ms: 20000, active_ms: 10000 }),
      session_id: start.session_id,
    };
    await ingest(batch([start, heartbeat]));
    fixture.sqlite
      .prepare(
        `INSERT INTO events
      SELECT product,environment,?,installation_id,session_id,name,2,occurred_at,received_at,day,
      app_version,os,arch,locale,country,region_code,dimension,?
      FROM events WHERE name='session_start' LIMIT 1`
      )
      .run(
        randomUUID(),
        JSON.stringify({ first_run: true, active_ms: 999999, duration_ms: 999999 })
      );
    expect((await admin()).data).toMatchObject({ new_installations: 0, foreground_ms: 10000 });
    expect(count("daily_events")).toBe(3);
  });

  it("拒绝无效信封、属性、超期、过大请求及越权来源", async () => {
    expect((await ingest({ ...batch(), schema_version: 2 })).status).toBe(400);
    expect((await ingest({ ...batch(), installation_id: "bad" })).status).toBe(400);
    expect((await ingest(batch([]))).status).toBe(400);
    expect((await ingest(batch(Array.from({ length: 51 }, () => event())))).status).toBe(400);
    expect((await ingest(batch(), { Origin: "https://evil.test" })).status).toBe(403);
    expect((await ingest({ ...batch(), extra: "x".repeat(65536) })).status).toBe(413);
    const response = await ingest(
      batch([
        { ...event(), occurred_at: "2026-09-01T00:00:00Z" },
        { ...event(), occurred_at: "2026-10-18T14:00:00Z" },
        event("heartbeat", { uptime_ms: 1, active_ms: 100 }),
      ])
    );
    expect((await response.json()).data.accepted).toEqual([]);
    expect(count("events")).toBe(0);
    fixture.env.INGEST_LIMITER = { limit: async () => ({ success: false }) };
    expect((await ingest(batch())).status).toBe(429);
  });
});

describe("管理与分析", () => {
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

  it("省份编码归一化，白名单维度拒绝SQL与无效日期", async () => {
    await ingest(batch());
    expect((await admin("/v1/admin/breakdown?dimension=provinces")).data).toEqual([
      { key: "CN-33", label: "浙江省", count: 1 },
    ]);
    expect((await admin("/v1/admin/breakdown?dimension=pages")).data[0]).toMatchObject({
      key: "home",
      count: 1,
    });
    const headers = { Authorization: `Bearer ${fixture.env.ADMIN_TOKEN}` };
    expect(
      (await request("/v1/admin/breakdown?dimension=events;DROP%20TABLE%20events", { headers }))
        .status
    ).toBe(400);
    for (const query of [
      "from=2026-02-30",
      "to=bad",
      "from=2020-01-01",
      "from=2026-10-19",
      "environment=staging",
    ])
      expect((await request(`/v1/admin/overview?${query}`, { headers })).status).toBe(400);
    const req = new Request(origin);
    Object.defineProperty(req, "cf", { value: { country: "CN", regionCode: "31" } });
    expect(geolocation(req).region_code).toBe("CN-31");
    expect(geolocation(new Request(origin))).toEqual({ country: "ZZ", region_code: "ZZ-unknown" });
  });

  it("留存只用明确新安装，未观察满的cohort返回null", async () => {
    const installed = randomUUID();
    vi.setSystemTime("2026-10-08T12:00:00Z");
    await ingest(batch([event("session_start", { first_run: true })], installed));
    await ingest(batch([event("session_start", { first_run: false })]));
    vi.setSystemTime("2026-10-09T12:00:00Z");
    await ingest(batch([event()], installed));
    vi.setSystemTime("2026-10-15T12:00:00Z");
    await ingest(batch([event()], installed));
    vi.setSystemTime("2026-10-18T12:00:00Z");
    const result = await admin("/v1/admin/retention?from=2026-10-08&to=2026-10-18");
    expect(result.data).toEqual([{ day: "2026-10-08", installations: 1, d1: 1, d7: 1, d30: null }]);
  });

  it("留存目标自然日尚未结束时保持观察中", async () => {
    vi.setSystemTime("2026-10-17T12:00:00Z");
    await ingest(batch([event("session_start", { first_run: true })]));
    vi.setSystemTime("2026-10-18T12:00:00Z");
    const result = await admin("/v1/admin/retention");
    expect(result.data).toEqual([
      { day: "2026-10-17", installations: 1, d1: null, d7: null, d30: null },
    ]);
  });

  it("清理明细不损坏历史聚合，过期事件不能重放", async () => {
    const input = batch();
    await ingest(input);
    vi.setSystemTime("2026-11-20T12:00:00Z");
    await cleanup(fixture.env);
    expect(count("events")).toBe(0);
    expect(count("daily_events")).toBe(1);
    expect((await admin("/v1/admin/overview?from=2026-10-18&to=2026-10-18")).data.events).toBe(1);
    const response = await ingest(input);
    expect((await response.json()).data.rejected[0].code).toBe("EVENT_TIME");
    expect(() => queryWindow(new URL(origin + "?to=invalid"))).toThrow();
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
    expect((await admin("/v1/admin/breakdown?dimension=download_provinces")).data[0].label).toBe(
      "浙江省"
    );
    vi.setSystemTime("2026-10-19T12:00:00Z");
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
