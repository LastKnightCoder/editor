import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { testEnvironment } from "./testing";
import { sha256 } from "./platform";
import { handle } from "./index";

let f: ReturnType<typeof testEnvironment>;
beforeEach(async () => {
  f = testEnvironment();
  f.env.REVIEWER_GITHUB_IDS = "admin";
  f.sqlite.exec(`INSERT INTO publishers VALUES('admin','maintainer',''),('author','author','');
    INSERT INTO visitors(id,token_hash,created_at) VALUES('visitor','unused','2026-10-01');
    INSERT INTO plugin_comments(id,plugin_id,visitor_id,client_request_id,message,created_at) VALUES('c1','test.plugin','visitor','original-request','评论正文','2026-10-18T00:00:00Z');
    INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES('u','author','ready','p.zip',1,'2026-10-01');
    INSERT INTO submissions(id,publisher_id,client_request_id,created_at,updated_at) VALUES('s','author','s','2026-10-01','2026-10-01');
    INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at)
      VALUES('r','test.plugin','1.0.0','s','u','author','r','hash',1,'{}','','','published','2026-10-01');`);
  for (const id of ["admin", "author"])
    f.sqlite
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .run(await sha256(id), id, "unused", "csrf", Date.now() + 3600000);
  f.sqlite
    .prepare("UPDATE visitors SET token_hash=? WHERE id='visitor'")
    .run(await sha256("v".repeat(72)));
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
const act = (action = "delete_comment", revision = 0, clientRequestId = crypto.randomUUID()) =>
  request("/v1/moderation/actions", {
    method: "POST",
    body: JSON.stringify({
      commentId: "c1",
      action,
      revision,
      clientRequestId,
      reason: "违反社区规范",
    }),
  });
const visitorWrite = (path: string, method: string, input: unknown) =>
  handle(
    new Request(f.env.API_ORIGIN + `/v1/plugins/test.plugin/${path}`, {
      method,
      headers: { Authorization: `Bearer ${"v".repeat(72)}`, "X-Tau-Visitor": "1" },
      body: JSON.stringify(input),
    }),
    f.env
  );

it("管理员校验覆盖查询与写入，普通发布者、匿名身份及无CSRF不能管理", async () => {
  expect((await request("/v1/moderation/comments", {}, "author")).status).toBe(403);
  expect((await request("/v1/moderation/events", {}, "missing")).status).toBe(401);
  expect(
    (
      await request("/v1/moderation/actions", {
        method: "POST",
        headers: { "X-CSRF-Token": "wrong" },
        body: "{}",
      })
    ).status
  ).toBe(403);
  expect(
    (await request("/v1/moderation/comments", { headers: { Origin: "https://evil.test" } })).status
  ).toBe(403);
  const rows = (await (await request("/v1/moderation/comments")).json()).data.items;
  expect(rows[0]).toMatchObject({ visitorId: "visitor", visitorRevision: 0, suspended: false });
  expect(JSON.stringify(rows)).not.toContain("token");
});

it("删除与审计原子提交，并发相同请求只记一次，正文不会留在审计中", async () => {
  const id = crypto.randomUUID();
  const results = await Promise.all([act("delete_comment", 0, id), act("delete_comment", 0, id)]);
  expect(results.map(r => r.status)).toEqual([200, 200]);
  expect(
    f.sqlite.prepare("SELECT message,deleted FROM plugin_comments WHERE id='c1'").get()
  ).toMatchObject({ message: "", deleted: 1 });
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_events").get()?.n).toBe(1);
  expect((await act()).status).toBe(409);
  expect((await act("suspend_visitor", 0, id)).status).toBe(409);
  const events = (await (await request("/v1/moderation/events")).json()).data.items;
  expect(events[0]).toMatchObject({
    reviewer: "admin",
    action: "delete_comment",
    reason: "违反社区规范",
  });
  expect(JSON.stringify(events)).not.toContain("评论正文");
});

it("封禁与恢复带版本保护；重试旧封禁不覆盖后来的恢复，公开写入遵守状态", async () => {
  const id = crypto.randomUUID();
  expect((await act("suspend_visitor", 0, id)).status).toBe(200);
  expect((await visitorWrite("like", "PUT", { liked: true })).status).toBe(403);
  expect(
    (
      await visitorWrite("comments", "POST", {
        message: "test",
        clientRequestId: crypto.randomUUID(),
      })
    ).status
  ).toBe(403);
  expect((await act("restore_visitor", 0)).status).toBe(409);
  expect((await act("restore_visitor", 1)).status).toBe(200);
  expect((await act("suspend_visitor", 0, id)).status).toBe(200);
  expect(
    f.sqlite.prepare("SELECT revoked,revision FROM visitors WHERE id='visitor'").get()
  ).toMatchObject({ revoked: 0, revision: 2 });
  expect((await visitorWrite("like", "PUT", { liked: true })).status).toBe(200);
});

it("处置失败回滚审计；评论分页绑定筛选且删除不破坏游标", async () => {
  f.sqlite.exec(
    "CREATE TRIGGER deny_delete BEFORE UPDATE ON plugin_comments BEGIN SELECT RAISE(ABORT,'test failure'); END;"
  );
  expect((await act()).status).toBe(500);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_events").get()?.n).toBe(0);
  f.sqlite.exec("DROP TRIGGER deny_delete");
  for (let i = 0; i < 22; i++)
    f.sqlite
      .prepare(
        "INSERT INTO plugin_comments(id,plugin_id,visitor_id,client_request_id,message,created_at) VALUES(?,'test.plugin','visitor',?,'text','2026-10-18T01:00:00Z')"
      )
      .run(`row-${i}`, `request-${i}`);
  const first = (await (await request("/v1/moderation/comments?status=all")).json()).data;
  expect(first.items).toHaveLength(20);
  const cursor = encodeURIComponent(first.nextCursor);
  expect((await request(`/v1/moderation/comments?status=visible&cursor=${cursor}`)).status).toBe(
    400
  );
  const second = (
    await (await request(`/v1/moderation/comments?status=all&cursor=${cursor}`)).json()
  ).data;
  expect(second.items).toHaveLength(3);
});

it("身份检查通过后发生封禁，旧在途请求仍不能插入评论或喜欢", async () => {
  const original = f.env.DB.prepare.bind(f.env.DB);
  vi.spyOn(f.env.DB, "prepare").mockImplementation(sql => {
    if (
      sql.includes("INSERT OR IGNORE INTO plugin_comments") ||
      sql.includes("INSERT OR IGNORE INTO plugin_likes")
    )
      f.sqlite.exec("UPDATE visitors SET revoked=1 WHERE id='visitor'");
    return original(sql);
  });
  expect(
    (
      await visitorWrite("comments", "POST", {
        message: "late",
        clientRequestId: crypto.randomUUID(),
      })
    ).status
  ).toBe(403);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM plugin_comments").get()?.n).toBe(1);
  f.sqlite.exec("UPDATE visitors SET revoked=0 WHERE id='visitor'");
  expect((await visitorWrite("like", "PUT", { liked: true })).status).toBe(403);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM plugin_likes").get()?.n).toBe(0);
});
