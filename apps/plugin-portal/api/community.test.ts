import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testEnvironment } from "./testing";
import { handle } from "./index";

let f: ReturnType<typeof testEnvironment>;
beforeEach(() => {
  f = testEnvironment();
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-18T12:00:00Z");
  f.sqlite.exec(`
    INSERT INTO publishers VALUES('author','author','');
    INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES('u','author','ready','p.zip',1,'2026-10-01');
    INSERT INTO submissions(id,publisher_id,client_request_id,created_at,updated_at) VALUES('s','author','s','2026-10-01','2026-10-01');
    INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at)
      VALUES('r','test.plugin','1.0.0','s','u','author','r','hash',1,'{}','','','published','2026-10-01');
  `);
});
afterEach(() => {
  f.sqlite.close();
  vi.useRealTimers();
});
const request = (path: string, init?: RequestInit) =>
  handle(new Request(f.env.API_ORIGIN + path, init), f.env);
async function token() {
  const response = await request("/v1/visitor-session", {
    method: "POST",
    headers: { "X-Tau-Visitor": "1" },
    body: JSON.stringify({ client: "desktop" }),
  });
  return (await response.json()).data.token as string;
}
const send = (method: string, path: string, bearer: string, input?: unknown) =>
  request(`/v1/plugins/test.plugin/${path}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, "X-Tau-Visitor": "1" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
const list = async (bearer: string, cursor = "") =>
  (await (await send("GET", `community${cursor ? `?cursor=${cursor}` : ""}`, bearer)).json()).data;
const post = (bearer: string, clientRequestId = crypto.randomUUID(), message = "使用体验") =>
  send("POST", "comments", bearer, { clientRequestId, message });

it("喜欢设置和取消可重试，身份之间隔离，公开查询不泄露身份", async () => {
  const a = await token(),
    b = await token();
  await Promise.all(Array.from({ length: 5 }, () => send("PUT", "like", a, { liked: true })));
  await send("PUT", "like", b, { liked: true });
  expect(await list(a)).toMatchObject({ likes: 2, liked: true });
  const publicData = await (await request("/v1/plugins/test.plugin/community")).json();
  expect(publicData.data).toMatchObject({ likes: 2, liked: false });
  expect(JSON.stringify(publicData)).not.toContain("visitor");
  await send("PUT", "like", a, { liked: false });
  await send("PUT", "like", a, { liked: false });
  expect(await list(a)).toMatchObject({ likes: 1, liked: false });
});

it("评论并发重试幂等，只有本人能删除；删除清空正文且重试不会复活", async () => {
  const a = await token(),
    b = await token(),
    id = crypto.randomUUID();
  const responses = await Promise.all([post(a, id), post(a, id)]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const row = (await list(a)).comments[0];
  expect((await list(a)).comments).toHaveLength(1);
  expect(row.canDelete).toBe(true);
  expect((await list(b)).comments[0].canDelete).toBe(false);
  expect((await post(a, id, "不同内容")).status).toBe(409);
  expect((await send("DELETE", `comments/${row.id}`, b)).status).toBe(404);
  expect((await send("DELETE", `comments/${row.id}`, a)).status).toBe(200);
  expect((await send("DELETE", `comments/${row.id}`, a)).status).toBe(200);
  expect((await list(a)).comments).toHaveLength(0);
  expect(
    f.sqlite.prepare("SELECT message FROM plugin_comments WHERE id=?").get(row.id)?.message
  ).toBe("");
  expect((await (await post(a, id)).json()).data.deleted).toBe(true);
});

it("分页稳定、拒绝无效游标；每日额度包含删除记录，次日恢复", async () => {
  const a = await token(),
    b = await token();
  for (let i = 0; i < 20; i++) expect((await post(a)).status).toBe(200);
  const row = (await list(a)).comments[0];
  await send("DELETE", `comments/${row.id}`, a);
  expect((await post(a)).status).toBe(429);
  await post(b);
  await post(b);
  const first = await list(a);
  expect(first.comments).toHaveLength(20);
  expect(first.nextCursor).toBeTruthy();
  const second = await list(a, first.nextCursor);
  expect(second.comments).toHaveLength(1);
  expect(first.comments.some((r: { id: string }) => r.id === second.comments[0].id)).toBe(false);
  expect((await send("GET", "community?cursor=missing", a)).status).toBe(400);
  vi.setSystemTime("2026-10-19T00:00:00Z");
  expect((await post(a)).status).toBe(200);
});

it("并发评论不会超出每日额度，已成功请求在额度耗尽后仍可重试", async () => {
  const a = await token();
  const ids = Array.from({ length: 25 }, () => crypto.randomUUID());
  const results = await Promise.all(ids.map(id => post(a, id)));
  expect(results.filter(r => r.status === 200)).toHaveLength(20);
  expect(results.filter(r => r.status === 429)).toHaveLength(5);
  const successful = results.findIndex(r => r.status === 200);
  expect((await post(a, ids[successful])).status).toBe(200);
  expect((await list(a)).comments).toHaveLength(20);
});

it("拒绝无身份、停用身份、跨来源、缺标识及未发布插件写入", async () => {
  const a = await token();
  expect((await post("")).status).toBe(403);
  expect((await post(a, crypto.randomUUID(), " ")).status).toBe(400);
  expect((await post(a, crypto.randomUUID(), "a".repeat(2001))).status).toBe(400);
  expect(
    (
      await request("/v1/plugins/test.plugin/like", {
        method: "PUT",
        headers: { Authorization: `Bearer ${a}` },
        body: '{"liked":true}',
      })
    ).status
  ).toBe(403);
  expect(
    (
      await request("/v1/plugins/test.plugin/community", {
        headers: { Origin: "https://evil.test" },
      })
    ).status
  ).toBe(403);
  expect((await request("/v1/plugins/missing/community")).status).toBe(404);
  f.sqlite.exec("UPDATE visitors SET revoked=1");
  expect((await post(a)).status).toBe(403);
});

it("目录喜欢数按插件批量统计，口径与社区接口一致，无人喜欢为0", async () => {
  f.sqlite.exec(`
    UPDATE releases SET name='测试插件',description='简介',min_app_version='0.1.0',published_at='2026-10-01T00:00:00.000Z';
    INSERT INTO submissions(id,publisher_id,client_request_id,created_at,updated_at) VALUES('s2','author','s2','2026-10-01','2026-10-01'),('s3','author','s3','2026-10-01','2026-10-01');
    INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,published_at,name,description,min_app_version,created_at)
      VALUES('r2','other.plugin','1.0.0','s2','u','author','r2','hash',1,'{}','','','published','2026-10-02T00:00:00.000Z','其他插件','简介','0.1.0','2026-10-02'),
            ('r3','quiet.plugin','1.0.0','s3','u','author','r3','hash',1,'{}','','','published','2026-10-03T00:00:00.000Z','冷门插件','简介','0.1.0','2026-10-03');
  `);
  const a = await token(),
    b = await token();
  await send("PUT", "like", a, { liked: true });
  await send("PUT", "like", b, { liked: true });
  await request("/v1/plugins/other.plugin/like", {
    method: "PUT",
    headers: { Authorization: `Bearer ${a}`, "X-Tau-Visitor": "1" },
    body: JSON.stringify({ liked: true }),
  });
  // 停用身份的历史喜欢在两处都保留计数。
  f.sqlite
    .prepare(
      "UPDATE visitors SET revoked=1 WHERE id=(SELECT visitor_id FROM plugin_likes WHERE plugin_id='other.plugin')"
    )
    .run();
  const likesOf = async () => {
    const items = (await (await request("/v1/catalog?appVersion=0.59.0&sort=updated")).json()).data
      .items as { pluginId: string; likes: number }[];
    return Object.fromEntries(items.map(item => [item.pluginId, item.likes]));
  };
  expect(await likesOf()).toEqual({ "test.plugin": 2, "other.plugin": 1, "quiet.plugin": 0 });
  for (const id of ["test.plugin", "other.plugin", "quiet.plugin"]) {
    const community = (await (await request(`/v1/plugins/${id}/community`)).json()).data;
    expect((await likesOf())[id]).toBe(community.likes);
  }
  await send("PUT", "like", b, { liked: false });
  expect((await likesOf())["test.plugin"]).toBe(1);
});
