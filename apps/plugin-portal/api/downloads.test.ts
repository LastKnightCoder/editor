import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { testEnvironment } from "./testing";
import { handle } from "./index";
import { cleanDownloadReceipts } from "./download-statistics";

let f: ReturnType<typeof testEnvironment>;
beforeEach(() => {
  f = testEnvironment();
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-18T12:00:00Z");
});
afterEach(() => {
  f.sqlite.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const req = (path: string, init?: RequestInit) =>
  handle(new Request(f.env.API_ORIGIN + path, init), f.env);
async function visitor(client = "desktop", extra: Record<string, string> = {}) {
  return req("/v1/visitor-session", {
    method: "POST",
    headers: { "X-Tau-Visitor": "1", "Content-Type": "application/json", ...extra },
    body: JSON.stringify({ client }),
  });
}
async function token() {
  return (await (await visitor()).json()).data.token as string;
}
function seed(id: string, plugin = "test.reader", version = "1.0.0", min = "0.59.0") {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  f.sqlite.prepare("INSERT OR IGNORE INTO publishers VALUES('author','author','')").run();
  f.sqlite
    .prepare(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES(?,'author','ready','plugin.zip',3,'2026-10-01')"
    )
    .run(id);
  f.sqlite
    .prepare(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at) VALUES(?,'author',?,'approved','2026-10-01','2026-10-01')"
    )
    .run(id, id);
  f.sqlite
    .prepare(
      `INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,published_at,name,description,min_app_version,created_at)
    VALUES(?,?,?,?,?,'author',?,?,3,'{}','https://github.com/a/plugin','commit','published','2026-10-01T00:00:00.000Z','阅读插件','简介',?,'2026-10-01')`
    )
    .run(id, plugin, version, id, id, id, hash, min);
  f.published.set(id, { bytes, contentType: "application/zip" });
}
const download = (id: string, bearer?: string) =>
  req(`/v1/releases/${id}/download`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
const total = () =>
  f.sqlite.prepare("SELECT SUM(downloads) AS n FROM plugin_download_totals").get()?.n ?? 0;

it("浏览器凭证不出现在 JSON；复用、跨站拒绝及停用身份", async () => {
  const response = await visitor("web", { Origin: f.env.WEB_ORIGIN });
  const data = (await response.json()).data;
  expect(data.token).toBeUndefined();
  const cookie = response.headers.get("Set-Cookie")!;
  expect(cookie).toContain("HttpOnly");
  const reused = await visitor("web", { Origin: f.env.WEB_ORIGIN, Cookie: cookie.split(";")[0] });
  expect((await reused.json()).data.visitorId).toBe(data.visitorId);
  expect((await visitor("web", { Origin: "https://evil.test" })).status).toBe(403);
  expect((await visitor("desktop", { Origin: f.env.WEB_ORIGIN })).status).toBe(400);
  f.sqlite.prepare("UPDATE visitors SET revoked=1 WHERE id=?").run(data.visitorId);
  expect((await visitor("web", { Cookie: cookie.split(";")[0] })).status).toBe(403);
});

it("移动客户端与桌面同样经 body 领取 token，且拒绝带 Origin", async () => {
  const response = await visitor("mobile");
  const data = (await response.json()).data;
  expect(data.token).toMatch(/^[\w-]{64,128}$/);
  const again = (await (await visitor("mobile", { Authorization: `Bearer ${data.token}` })).json())
    .data;
  expect(again.visitorId).toBe(data.visitorId);
  expect(again.token).toBeUndefined();
  expect((await visitor("mobile", { Origin: f.env.WEB_ORIGIN })).status).toBe(400);
  expect((await visitor("unknown-client")).status).toBe(400);
});

it("同设备同版本同日并发只计一次；跨日、跨版本和不同设备分别计数", async () => {
  seed("r1");
  seed("r2", "test.reader", "2.0.0");
  const a = await token(),
    b = await token();
  const responses = await Promise.all(Array.from({ length: 20 }, () => download("r1", a)));
  expect(responses.every(r => r.status === 200)).toBe(true);
  expect(total()).toBe(1);
  await download("r2", a);
  await download("r1", b);
  expect(total()).toBe(3);
  vi.setSystemTime("2026-10-19T00:00:00Z");
  await download("r1", a);
  expect(total()).toBe(4);
});

it("无凭证、预检、失败和损坏文件不计数；统计故障不阻断下载且事务回滚", async () => {
  seed("r1");
  const a = await token();
  await download("r1");
  await download("r1", "x".repeat(72));
  await req("/v1/releases/r1/download", { method: "OPTIONS" });
  expect((await download("missing", a)).status).toBe(404);
  expect(total()).toBe(0);
  f.published.set("r1", { bytes: new Uint8Array([3, 2, 1]), contentType: "application/zip" });
  expect((await download("r1", a)).status).toBe(503);
  expect(total()).toBe(0);
  f.published.set("r1", { bytes: new Uint8Array([1, 2, 3]), contentType: "application/zip" });
  f.sqlite.exec("DROP TABLE plugin_download_daily");
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect((await download("r1", a)).status).toBe(200);
  expect(total()).toBe(0);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM download_receipts").get()?.n).toBe(0);
  expect(logged).toHaveBeenCalledWith("plugin_download_statistics_failed");
});

it("最近七日与累计榜单分开排序，分页搜索和兼容版本保持正确", async () => {
  seed("a1", "test.a");
  seed("a2", "test.a", "2.0.0", "0.60.0");
  seed("b1", "test.b");
  f.sqlite.exec(
    "INSERT INTO plugin_download_totals VALUES('test.a',20),('test.b',10); INSERT INTO plugin_download_daily VALUES('test.a','2026-10-11',20),('test.b','2026-10-12',10)"
  );
  const list = async (query: string) =>
    (await (await req(`/v1/catalog?appVersion=0.59.0&${query}`)).json()).data;
  const first = await list("limit=1&q=阅读");
  expect(first.items[0].pluginId).toBe("test.b");
  expect(first.items[0].downloads7d).toBe(10);
  const second = await list(`limit=1&q=阅读&cursor=${encodeURIComponent(first.nextCursor)}`);
  expect(second.items[0].pluginId).toBe("test.a");
  expect(second.items[0].downloads7d).toBe(0);
  expect(second.items[0].latest.version).toBe("2.0.0");
  expect(second.items[0].compatible.version).toBe("1.0.0");
  expect((await list("sort=downloadsTotal")).items[0].pluginId).toBe("test.a");
  expect((await (await req("/v1/plugins/test.a/stats")).json()).data).toEqual({
    downloadsTotal: 20,
    downloads7d: 0,
    windowStart: "2026-10-12",
  });
  expect((await req("/v1/plugins/missing/stats")).status).toBe(404);
  expect(
    (
      await req(
        `/v1/catalog?appVersion=0.59.0&sort=updated&cursor=${encodeURIComponent(first.nextCursor)}`
      )
    ).status
  ).toBe(400);
  await cleanDownloadReceipts(f.env);
  expect(total()).toBe(30);
});

it("限制匿名身份申请频率，已有身份继续可用", async () => {
  const a = await token();
  for (let i = 1; i < 60; i++) expect((await visitor()).status).toBe(200);
  expect((await visitor()).status).toBe(429);
  expect((await visitor("desktop", { Authorization: `Bearer ${a}` })).status).toBe(200);
});

it("下载统计注册后台任务，过期去重记录清理不扣减累计值", async () => {
  seed("r1");
  const a = await token();
  const tasks: Promise<unknown>[] = [];
  expect(
    (
      await handle(
        new Request(f.env.API_ORIGIN + "/v1/releases/r1/download", {
          headers: { Authorization: `Bearer ${a}` },
        }),
        f.env,
        { waitUntil: task => tasks.push(task) }
      )
    ).status
  ).toBe(200);
  expect(tasks).toHaveLength(1);
  await Promise.all(tasks);
  expect(total()).toBe(1);
  vi.setSystemTime("2026-10-22T12:00:00Z");
  await cleanDownloadReceipts(f.env);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM download_receipts").get()?.n).toBe(0);
  expect(total()).toBe(1);
});
