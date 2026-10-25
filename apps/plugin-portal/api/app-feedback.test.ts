import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it } from "vitest";
import { APP_FEEDBACK_LIMITS } from "../contracts";
import { testEnvironment } from "./testing";
import { sha256 } from "./platform";
import { cleanAppFeedback, imageMime } from "./app-feedback";
import { handle } from "./index";

const TOKEN = "v".repeat(72);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

let f: ReturnType<typeof testEnvironment>;
beforeEach(async () => {
  f = testEnvironment();
  f.env.REVIEWER_GITHUB_IDS = "admin";
  f.sqlite.exec(`INSERT INTO publishers VALUES('admin','maintainer',''),('author','author','');`);
  f.sqlite
    .prepare("INSERT INTO visitors(id,token_hash,created_at) VALUES('visitor',?,'2026-10-01')")
    .run(await sha256(TOKEN));
  for (const id of ["admin", "author"])
    f.sqlite
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .run(await sha256(id), id, "unused", "csrf", Date.now() + 3600000);
});
afterEach(() => f.sqlite.close());

function form(
  meta: Record<string, unknown> = {},
  files: Record<string, Uint8Array[]> = {}
): FormData {
  const data = new FormData();
  data.set(
    "meta",
    JSON.stringify({
      kind: "bug",
      message: "白板拖动卡片会卡住",
      contact: null,
      context: { appVersion: "0.59.0", platform: "darwin", page: "whiteboard" },
      clientRequestId: crypto.randomUUID(),
      ...meta,
    })
  );
  for (const [name, list] of Object.entries(files))
    for (const bytes of list) data.append(name, new Blob([new Uint8Array(bytes)]), name);
  return data;
}
const submit = (data: FormData, headers: Record<string, string> = {}) =>
  handle(
    new Request(f.env.API_ORIGIN + "/v1/app-feedback", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "X-Tau-Visitor": "1", ...headers },
      body: data,
    }),
    f.env
  );
const admin = (path: string, init: RequestInit = {}, user = "admin") =>
  handle(
    new Request(f.env.API_ORIGIN + "/v1/moderation/app-feedback" + path, {
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

it("按魔数识别图片，拒绝 SVG", () => {
  expect(imageMime(PNG)).toBe("image/png");
  expect(imageMime(WEBP)).toBe("image/webp");
  expect(imageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  expect(imageMime(SVG)).toBeNull();
});

it("桌面端提交正文、截图与日志，管理员可查看详情和附件", async () => {
  const log = gzipSync("session log");
  const response = await submit(
    form(
      { contact: " me@example.com " },
      { image: [PNG, WEBP], log: [log], perf: [gzipSync("{}")] }
    )
  );
  expect(response.status).toBe(200);
  const { id } = (await response.json()).data;
  expect(f.feedback.size).toBe(4);

  const page = (await (await admin("")).json()).data;
  expect(page.counts).toEqual({ new: 1, doing: 0, done: 0, ignored: 0 });
  expect(page.items[0]).toMatchObject({
    id,
    kind: "bug",
    status: "new",
    visitorId: "visitor",
    appVersion: "0.59.0",
    platform: "darwin",
    imageCount: 2,
    hasLogs: true,
  });

  const detail = (await (await admin(`/${id}`)).json()).data;
  expect(detail).toMatchObject({ contact: "me@example.com", revision: 0, note: "" });
  expect(detail.context.page).toBe("whiteboard");
  expect(detail.attachments.map((a: { kind: string }) => a.kind)).toEqual([
    "image",
    "image",
    "log",
    "perf",
  ]);

  const image = await admin(`/${id}/attachments/${detail.attachments[0].id}`);
  expect(image.headers.get("Content-Type")).toBe("image/png");
  expect(image.headers.get("Content-Security-Policy")).toBe("sandbox");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  const logFile = await admin(`/${id}/attachments/${detail.attachments[2].id}`);
  expect(logFile.headers.get("Content-Disposition")).toContain("attachment");
  expect(new Uint8Array(await logFile.arrayBuffer())).toEqual(new Uint8Array(log));
});

it("只接受桌面匿名身份，校验类型与大小", async () => {
  expect((await submit(form(), { Origin: f.env.WEB_ORIGIN })).status).toBe(403);
  expect((await submit(form(), { Authorization: "Bearer " + "x".repeat(72) })).status).toBe(403);
  expect((await submit(form({ message: "  " }))).status).toBe(400);
  expect((await submit(form({ kind: "spam" }))).status).toBe(400);
  expect((await submit(form({}, { image: [SVG] }))).status).toBe(400);
  expect((await submit(form({}, { image: [PNG, PNG, PNG, PNG] }))).status).toBe(400);
  expect((await submit(form({}, { log: [new TextEncoder().encode("plain")] }))).status).toBe(400);
  const big = new Uint8Array(APP_FEEDBACK_LIMITS.imageBytes + 1);
  big.set(PNG);
  expect((await submit(form({}, { image: [big] }))).status).toBe(413);
  expect(f.feedback.size).toBe(0);
  f.sqlite.exec("UPDATE visitors SET revoked=1");
  expect((await submit(form())).status).toBe(403);
});

it("同一请求ID重试返回原记录，不重复写入；改了内容则冲突", async () => {
  const clientRequestId = crypto.randomUUID();
  const first = (await (await submit(form({ clientRequestId }, { image: [PNG] }))).json()).data;
  const again = (await (await submit(form({ clientRequestId }, { image: [PNG] }))).json()).data;
  expect(again.id).toBe(first.id);
  expect(f.feedback.size).toBe(1);
  expect((await submit(form({ clientRequestId, message: "另一条" }))).status).toBe(409);
});

it("每个匿名身份每天限额，超出不写对象", async () => {
  for (let i = 0; i < APP_FEEDBACK_LIMITS.perVisitorDaily; i++)
    expect((await submit(form())).status).toBe(200);
  const limited = await submit(form({}, { image: [PNG] }));
  expect(limited.status).toBe(429);
  expect(f.feedback.size).toBe(0);
});

it("管理员按状态筛选、改状态与备注，版本冲突返回409；非管理员403", async () => {
  const { id } = (await (await submit(form())).json()).data;
  expect((await admin("", {}, "author")).status).toBe(403);
  const patch = (input: unknown) =>
    admin(`/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  expect((await patch({ status: "doing", revision: 0 })).status).toBe(200);
  expect((await patch({ note: "已复现", revision: 0 })).status).toBe(409);
  const saved = (await (await patch({ note: "已复现", revision: 1 })).json()).data;
  expect(saved).toMatchObject({ status: "doing", note: "已复现", revision: 2 });
  expect((await patch({ status: "spam", revision: 2 })).status).toBe(400);
  expect((await (await admin("?status=new")).json()).data.items).toEqual([]);
  const doing = (await (await admin("?status=doing")).json()).data;
  expect(doing.items[0].id).toBe(id);
  expect(doing.counts.doing).toBe(1);
  expect((await admin("?status=bogus")).status).toBe(400);
  expect((await admin("/missing")).status).toBe(404);
});

it("清理过期的额度计数，但保留反馈记录", async () => {
  const { id } = (await (await submit(form({}, { image: [PNG] }))).json()).data;
  f.sqlite.prepare("UPDATE app_feedback SET created_at='2020-01-01T00:00:00Z' WHERE id=?").run(id);
  f.sqlite.exec("UPDATE app_feedback_ip_limits SET day='2020-01-01'");
  f.sqlite.exec("UPDATE app_feedback_daily_bytes SET day='2020-01-01'");
  await cleanAppFeedback(f.env);
  // 反馈记录和附件应该保留
  expect(f.feedback.size).toBe(1);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM app_feedback").get()).toEqual({ n: 1 });
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM app_feedback_attachments").get()).toEqual({
    n: 1,
  });
  // 额度计数应该被清理
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM app_feedback_ip_limits").get()).toEqual({
    n: 0,
  });
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM app_feedback_daily_bytes").get()).toEqual({
    n: 0,
  });
});
