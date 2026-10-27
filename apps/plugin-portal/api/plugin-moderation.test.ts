import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testEnvironment } from "./testing";
import { sha256 } from "./platform";
import { handle } from "./index";

let f: ReturnType<typeof testEnvironment>;
beforeEach(async () => {
  f = testEnvironment();
  f.env.REVIEWER_GITHUB_IDS = "admin";
  const content = (id: string) =>
    JSON.stringify({ manifest: { id, name: id, minAppVersion: "0.59.0" } });
  f.sqlite
    .exec(`INSERT INTO publishers VALUES('admin','maintainer',''),('author','author',''),('other','other','');
    INSERT INTO plugins(id,publisher_id,repository_id,repository) VALUES
      ('test.plugin','author','repo-1','https://github.com/author/plugin'),
      ('other.plugin','other','repo-2','https://github.com/other/plugin');
    INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES
      ('u1','author','ready','p.zip',1,'2026-10-01'),('u2','other','ready','p.zip',1,'2026-10-01');
    INSERT INTO submissions(id,publisher_id,client_request_id,status,plugin_id,plugin_version,created_at,updated_at,submitted_at) VALUES
      ('s1','author','s1','approved','test.plugin','1.0.0','2026-10-01','2026-10-01','2026-10-01'),
      ('s2','other','s2','approved','other.plugin','1.0.0','2026-10-01','2026-10-01','2026-10-01');
    INSERT INTO visitors(id,token_hash,created_at) VALUES('visitor','unused','2026-10-01');
    INSERT INTO plugin_comments(id,plugin_id,visitor_id,client_request_id,message,created_at) VALUES('c1','test.plugin','visitor','req','评论','2026-10-18T00:00:00Z');`);
  const release = f.sqlite.prepare(
    `INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,published_at,name,description,min_app_version,categories,created_at)
    VALUES(?,?,'1.0.0',?,?,?,?,'hash',1,?,?,'commit','published','2026-10-01T00:00:00.000Z',?,'用于测试','0.59.0',?,'2026-10-01')`
  );
  release.run(
    "r1",
    "test.plugin",
    "s1",
    "u1",
    "author",
    "r1",
    content("test.plugin"),
    "https://github.com/author/plugin",
    "测试插件",
    '["sync"]'
  );
  release.run(
    "r2",
    "other.plugin",
    "s2",
    "u2",
    "other",
    "r2",
    content("other.plugin"),
    "https://github.com/other/plugin",
    "其他插件",
    '["editor"]'
  );
  for (const id of ["admin", "author"])
    f.sqlite
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .run(await sha256(id), id, "unused", "csrf", Date.now() + 3600000);
});
afterEach(() => {
  vi.restoreAllMocks();
  f.sqlite.close();
});
const request = (path: string, init: RequestInit = {}, user = "admin") =>
  handle(
    new Request(f.env.API_ORIGIN + path, {
      ...init,
      headers: {
        Cookie: `tau_session=${user}`,
        Origin: f.env.WEB_ORIGIN,
        "X-CSRF-Token": "csrf",
        ...init.headers,
      },
    }),
    f.env
  );
const anonymous = (path: string) => handle(new Request(f.env.API_ORIGIN + path), f.env);
const data = async (response: Response) => (await response.json()).data;
const act = (
  action: "disable_plugin" | "enable_plugin",
  pluginId = "test.plugin",
  clientRequestId = crypto.randomUUID(),
  reason = "包含违规内容，请移除后重新提交"
) =>
  request("/v1/moderation/plugin-actions", {
    method: "POST",
    body: JSON.stringify({ pluginId, action, reason, clientRequestId }),
  });
const catalogIds = async (query = "") =>
  (await data(await anonymous(`/v1/catalog?appVersion=0.59.0${query}`))).items.map(
    (item: { pluginId: string }) => item.pluginId
  );

it("只有管理员能查看与处置插件；普通发布者403，未登录401", async () => {
  expect((await request("/v1/moderation/plugins", {}, "author")).status).toBe(403);
  expect((await request("/v1/moderation/plugin-events", {}, "missing")).status).toBe(401);
  expect(
    (await request("/v1/moderation/plugin-actions", { method: "POST", body: "{}" }, "author"))
      .status
  ).toBe(403);
});

it("管理列表按ID升序并支持按ID或已发布名称搜索、按状态筛选", async () => {
  const all = await data(await request("/v1/moderation/plugins"));
  expect(all.items.map((item: { pluginId: string }) => item.pluginId)).toEqual([
    "other.plugin",
    "test.plugin",
  ]);
  expect(all.items[1]).toMatchObject({
    name: "测试插件",
    publisher: { login: "author" },
    releaseCount: 1,
    latestVersion: "1.0.0",
    latestPublishedAt: "2026-10-01T00:00:00.000Z",
    downloadsTotal: 0,
    disabled: null,
  });
  const byName = await data(await request("/v1/moderation/plugins?q=测试"));
  expect(byName.items.map((item: { pluginId: string }) => item.pluginId)).toEqual(["test.plugin"]);
  const byId = await data(await request("/v1/moderation/plugins?q=OTHER"));
  expect(byId.items.map((item: { pluginId: string }) => item.pluginId)).toEqual(["other.plugin"]);
  expect((await data(await request("/v1/moderation/plugins?status=disabled"))).items).toEqual([]);
  expect((await request("/v1/moderation/plugins?status=bogus")).status).toBe(400);
});

it("禁用后公开目录、搜索、版本、下载、统计与社区都当作不存在，管理端仍可搜到并带原因", async () => {
  expect(await catalogIds()).toEqual(["other.plugin", "test.plugin"]);
  const response = await act("disable_plugin");
  expect(response.status).toBe(200);
  expect(await data(response)).toMatchObject({
    reviewer: "admin",
    pluginId: "test.plugin",
    action: "disable_plugin",
  });

  expect(await catalogIds()).toEqual(["other.plugin"]);
  expect(await catalogIds("&q=测试插件")).toEqual([]);
  const counts = (await data(await anonymous("/v1/catalog?appVersion=0.59.0"))).categoryCounts;
  expect(counts).toEqual({ editor: 1 });
  expect((await data(await anonymous("/v1/releases?pluginId=test.plugin"))).items).toEqual([]);
  expect((await anonymous("/v1/releases/r1")).status).toBe(404);
  expect((await anonymous("/v1/releases/r1/download")).status).toBe(404);
  expect((await anonymous("/v1/plugins/test.plugin/stats")).status).toBe(404);
  expect((await anonymous("/v1/plugins/test.plugin/community")).status).toBe(404);
  expect((await anonymous("/v1/releases/r2")).status).toBe(200);

  const disabled = await data(await request("/v1/moderation/plugins?status=disabled"));
  expect(disabled.items).toHaveLength(1);
  expect(disabled.items[0]).toMatchObject({
    pluginId: "test.plugin",
    disabled: { reason: "包含违规内容，请移除后重新提交", by: "admin" },
  });
  expect(typeof disabled.items[0].disabled.at).toBe("string");
  expect((await data(await request("/v1/moderation/plugins?status=active"))).items).toHaveLength(1);
});

it("作者在提交详情与归组列表看到禁用原因", async () => {
  await act("disable_plugin");
  const submission = await data(await request("/v1/submissions/s1", {}, "author"));
  expect(submission.pluginId).toBe("test.plugin");
  expect(submission.disabled).toMatchObject({ reason: "包含违规内容，请移除后重新提交" });
  const groups = (await data(await request("/v1/submission-groups", {}, "author"))).groups;
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({
    pluginId: "test.plugin",
    disabled: { reason: "包含违规内容，请移除后重新提交" },
  });
  // 他人插件的禁用不会误显示在本作者的分组上。
  await act("enable_plugin");
  await act("disable_plugin", "other.plugin");
  const after = (await data(await request("/v1/submission-groups", {}, "author"))).groups;
  expect(after[0].disabled).toBeNull();
});

it("同请求ID重试幂等，不同参数或状态已变返回409，未知插件404，参数无效400", async () => {
  const requestId = crypto.randomUUID();
  const first = await data(await act("disable_plugin", "test.plugin", requestId));
  const retry = await data(await act("disable_plugin", "test.plugin", requestId));
  expect(retry.id).toBe(first.id);
  expect(
    (await (await act("disable_plugin", "test.plugin", requestId, "另一个原因")).json()).error.code
  ).toBe("REVISION_CONFLICT");
  expect((await (await act("disable_plugin")).json()).error.code).toBe("REVISION_CONFLICT");
  expect((await act("disable_plugin", "missing.plugin")).status).toBe(404);
  expect(
    (
      await request("/v1/moderation/plugin-actions", {
        method: "POST",
        body: JSON.stringify({
          pluginId: "test.plugin",
          action: "enable_plugin",
          reason: "",
          clientRequestId: crypto.randomUUID(),
        }),
      })
    ).status
  ).toBe(400);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM plugin_moderation_events").get()?.n).toBe(1);
});

it("恢复后立即重新可见，操作记录按时间倒序列出禁用与恢复", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-27T00:00:00Z") });
  await act("disable_plugin");
  expect(await catalogIds()).toEqual(["other.plugin"]);
  // 同一毫秒的两条记录按随机 id 排序，倒序断言需要两次操作的时间不同
  vi.setSystemTime(new Date("2026-10-27T00:00:01Z"));
  const restore = await act("enable_plugin", "test.plugin", crypto.randomUUID(), "作者已整改");
  vi.useRealTimers();
  expect(restore.status).toBe(200);
  expect(await catalogIds()).toEqual(["other.plugin", "test.plugin"]);
  expect((await anonymous("/v1/releases/r1")).status).toBe(200);
  expect((await anonymous("/v1/plugins/test.plugin/community")).status).toBe(200);
  const row = f.sqlite
    .prepare("SELECT disabled_at,disabled_by,disabled_reason FROM plugins WHERE id='test.plugin'")
    .get();
  expect(row).toEqual({ disabled_at: null, disabled_by: null, disabled_reason: null });
  const events = await data(await request("/v1/moderation/plugin-events"));
  expect(events.items.map((event: { action: string }) => event.action)).toEqual([
    "enable_plugin",
    "disable_plugin",
  ]);
  expect(events.items[0].reason).toBe("作者已整改");
});
