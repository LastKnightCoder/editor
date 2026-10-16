import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handle } from "./index";
import { inspectPackage } from "./package";
import { testEnvironment } from "./testing";
import type { Submission, Upload } from "../contracts";

function zip(
  options: {
    version?: string;
    readme?: string | null;
    description?: string;
    corrupt?: boolean;
  } = {}
) {
  const file = new AdmZip(),
    code = "module.exports={activate(){}}";
  file.addFile(
    "test.reader/manifest.json",
    Buffer.from(
      JSON.stringify({
        id: "test.reader",
        name: "阅读插件",
        description: options.description ?? "同步阅读摘录",
        version: options.version ?? "1.0.0",
        minAppVersion: "0.59.0",
        formatVersion: 1,
        apiVersion: 1,
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      })
    )
  );
  file.addFile("test.reader/main.js", Buffer.from(options.corrupt ? "broken" : code));
  if (options.readme !== null)
    file.addFile(
      "test.reader/README.md",
      Buffer.from(options.readme ?? "# 阅读插件\n\n## 使用\n启用后打开侧边栏。")
    );
  return file.toBuffer();
}
describe("包资料与站内反馈", () => {
  let f: ReturnType<typeof testEnvironment>,
    cookie = "",
    csrf = "",
    admin = true;
  beforeEach(() => {
    f = testEnvironment();
    cookie = "";
    csrf = "";
    admin = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("access_token")
          ? Response.json({ access_token: "test-token" })
          : input.endsWith("/user")
            ? Response.json({ id: 42, login: "author", avatar_url: "" })
            : input.includes("/commits/")
              ? Response.json({ sha: "a".repeat(40) })
              : Response.json({
                  id: 123,
                  private: false,
                  default_branch: "main",
                  permissions: { admin },
                })
      )
    );
  });
  afterEach(() => {
    f.sqlite.close();
    vi.unstubAllGlobals();
  });
  const req = (path: string, method = "GET", input?: unknown, extra: Record<string, string> = {}) =>
    handle(
      new Request(f.env.API_ORIGIN + path, {
        method,
        headers: {
          Origin: f.env.WEB_ORIGIN,
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
          ...extra,
        },
        body:
          input === undefined
            ? undefined
            : input instanceof Uint8Array
              ? (input as BodyInit)
              : JSON.stringify(input),
      }),
      f.env
    );
  async function login() {
    const start = await req("/v1/auth/github");
    const state = new URL(start.headers.get("Location")!).searchParams.get("state");
    cookie = `tau_oauth=${state}`;
    const result = await req(`/v1/auth/github/callback?code=test&state=${state}`);
    cookie = result.headers
      .getSetCookie()
      .find(x => x.startsWith("tau_session="))!
      .split(";")[0];
    csrf = (await (await req("/v1/session")).json()).data.csrfToken;
  }
  async function upload(bytes = zip()): Promise<Upload> {
    const ticket = (
      await (
        await req("/v1/uploads", "POST", { fileName: "plugin.zip", size: bytes.length })
      ).json()
    ).data;
    const response = await req(new URL(ticket.uploadUrl).pathname, "PUT", bytes);
    expect(response.status).toBe(200);
    return (await response.json()).data;
  }
  async function draft(): Promise<Submission> {
    return (
      await (await req("/v1/submissions", "POST", { clientRequestId: crypto.randomUUID() })).json()
    ).data;
  }
  async function ready(version = "1.0.0"): Promise<Submission> {
    const up = await upload(zip({ version })),
      record = await draft();
    const response = await req(`/v1/submissions/${record.id}`, "PATCH", {
      revision: record.revision,
      packageUploadId: up.id,
      repository: "https://github.com/author/plugin",
    });
    expect(response.status).toBe(200);
    return (await response.json()).data;
  }
  const submit = (record: Submission) =>
    req(`/v1/submissions/${record.id}/submit`, "POST", { revision: record.revision });
  it("匿名访问和CSRF受控", async () => {
    expect((await req("/v1/submissions")).status).toBe(401);
    await login();
    expect((await req("/v1/submissions", "POST", {}, { "X-CSRF-Token": "wrong" })).status).toBe(
      403
    );
    expect(
      (await req("/v1/session", "GET", undefined, { Origin: "https://wrong.example" })).status
    ).toBe(403);
  });
  it("OAuth state失配不创建会话；令牌加密存储，退出失效", async () => {
    expect(
      (await req("/v1/auth/github/callback?code=x&state=bad")).headers.get("Location")
    ).toContain("oauth_failed");
    await login();
    expect(f.sqlite.prepare("SELECT github_token FROM sessions").get()?.github_token).not.toContain(
      "test-token"
    );
    await req("/v1/logout", "POST");
    expect((await req("/v1/submissions")).status).toBe(401);
  });
  it("README是唯一说明来源，保存表单不能覆盖包资料", async () => {
    await login();
    const up = await upload(),
      record = await draft();
    const r = await req(`/v1/submissions/${record.id}`, "PATCH", {
      revision: 1,
      packageUploadId: up.id,
      repository: "",
      description: "伪造说明",
      listing: { description: "伪造" },
    });
    const data = (await r.json()).data;
    expect(data.content.readme).toContain("启用后");
    expect(data.content.manifest.description).toBe("同步阅读摘录");
    expect(data).not.toHaveProperty("listing");
    expect(f.objects.size).toBe(1);
  });
  it.each([
    { readme: null },
    { readme: " " },
    { description: "" },
    { description: "长".repeat(161) },
    { corrupt: true },
  ])("拒绝缺少或无效说明、简介及破损包 %j", async options => {
    await expect(inspectPackage(zip(options))).rejects.toThrow();
  });
  it("说明大小限制与可选更新说明", async () => {
    await expect(inspectPackage(zip({ readme: "a".repeat(131073) }))).rejects.toThrow("128KiB");
    const file = new AdmZip(zip());
    file.addFile("test.reader/CHANGELOG.md", Buffer.from("# 1.0.0\n首次发布"));
    expect((await inspectPackage(file.toBuffer())).changelog).toContain("首次发布");
  });
  it("坏包不写R2，保留失败结果", async () => {
    await login();
    const bytes = zip({ corrupt: true });
    const t = (
      await (await req("/v1/uploads", "POST", { fileName: "bad.zip", size: bytes.length })).json()
    ).data;
    expect((await req(new URL(t.uploadUrl).pathname, "PUT", bytes)).status).toBe(422);
    expect((await (await req(`/v1/uploads/${t.upload.id}`)).json()).data.status).toBe("invalid");
    expect(f.objects.size).toBe(0);
  });
  it("上传不可覆盖，过期等待票据明确失败", async () => {
    await login();
    const up = await upload();
    expect(
      (await (await req(`/v1/uploads/${up.id}/content`, "PUT", zip())).json()).error.code
    ).toBe("UPLOAD_STATE_CONFLICT");
    const t = (
      await (await req("/v1/uploads", "POST", { fileName: "old.zip", size: zip().length })).json()
    ).data;
    f.sqlite
      .prepare("UPDATE uploads SET created_at=? WHERE id=?")
      .run(new Date(0).toISOString(), t.upload.id);
    expect((await (await req(new URL(t.uploadUrl).pathname, "PUT", zip())).json()).error.code).toBe(
      "UPLOAD_EXPIRED"
    );
  });
  it("提交只需包和仓库，源码版本由GitHub解析并冻结", async () => {
    await login();
    const record = await ready();
    const r = await submit(record);
    expect(r.status).toBe(200);
    const data = (await r.json()).data;
    expect(data).toMatchObject({
      status: "pending_review",
      commit: "a".repeat(40),
      canEdit: false,
    });
    expect((await submit(record)).status).toBe(200);
    expect(
      (
        await (
          await req(`/v1/submissions/${record.id}`, "PATCH", {
            revision: data.revision,
            repository: "",
            packageUploadId: null,
          })
        ).json()
      ).error.code
    ).toBe("SUBMISSION_LOCKED");
  });
  it("后续版本复用已关联的仓库", async () => {
    await login();
    await submit(await ready());
    const up = await upload(zip({ version: "1.1.0" })),
      d = await draft();
    const data = (
      await (
        await req(`/v1/submissions/${d.id}`, "PATCH", {
          revision: 1,
          repository: "",
          packageUploadId: up.id,
        })
      ).json()
    ).data;
    expect(data.repository).toBe("https://github.com/author/plugin");
  });
  it("仓库权限与重复版本仍受约束", async () => {
    await login();
    const a = await ready();
    admin = false;
    expect((await submit(a)).status).toBe(403);
    admin = true;
    await submit(a);
    const b = await ready();
    expect((await (await submit(b)).json()).error.code).toBe("VERSION_ALREADY_SUBMITTED");
  });
  it("草稿创建幂等、并发保存只接受一个版本", async () => {
    await login();
    const input = { clientRequestId: crypto.randomUUID() };
    const a = (await (await req("/v1/submissions", "POST", input)).json()).data,
      b = (await (await req("/v1/submissions", "POST", input)).json()).data;
    expect(a.id).toBe(b.id);
    const responses = await Promise.all(
      ["a", "b"].map(name =>
        req(`/v1/submissions/${a.id}`, "PATCH", {
          revision: 1,
          packageUploadId: null,
          repository: `https://github.com/author/${name}`,
        })
      )
    );
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it("仓库错误返回字段提示；其他作者不能读取记录或上传", async () => {
    await login();
    const d = await ready();
    const r = await req(`/v1/submissions/${d.id}`, "PATCH", {
      revision: d.revision,
      packageUploadId: d.packageUploadId,
      repository: "bad",
    });
    expect((await r.json()).error.fields.repository).toBeTruthy();
    f.sqlite.exec(
      "INSERT INTO publishers VALUES ('other','other',''); UPDATE sessions SET publisher_id='other'"
    );
    expect((await req(`/v1/submissions/${d.id}`)).status).toBe(404);
    expect((await req(`/v1/uploads/${d.packageUploadId}`)).status).toBe(404);
  });
  it("作者和审核者可站内反馈，重试不重复，旁观者不可读", async () => {
    await login();
    const d = await ready();
    await submit(d);
    const message = { message: "请补充安装步骤", clientRequestId: crypto.randomUUID() };
    expect((await req(`/v1/submissions/${d.id}/feedback`, "POST", message)).status).toBe(201);
    await req(`/v1/submissions/${d.id}/feedback`, "POST", message);
    expect((await (await req(`/v1/submissions/${d.id}/feedback`)).json()).data.items).toHaveLength(
      1
    );
    f.sqlite.exec(
      "INSERT INTO publishers VALUES ('reviewer','reviewer',''); UPDATE sessions SET publisher_id='reviewer'"
    );
    expect((await req(`/v1/submissions/${d.id}/feedback`)).status).toBe(404);
    f.env.REVIEWER_GITHUB_IDS = "reviewer";
    expect((await req(`/v1/submissions/${d.id}/feedback`)).status).toBe(200);
    const reply = (
      await (
        await req(`/v1/submissions/${d.id}/feedback`, "POST", {
          message: "已查看",
          clientRequestId: crypto.randomUUID(),
        })
      ).json()
    ).data;
    expect(reply.role).toBe("reviewer");
    expect((await (await req("/v1/submissions?scope=review")).json()).data.items).toHaveLength(1);
    expect((await req(`/v1/submissions/${d.id}`, "PATCH", {})).status).toBe(403);
  });
  it("拒绝空反馈和超长反馈，反馈不修改冻结内容", async () => {
    await login();
    const d = await ready();
    await submit(d);
    for (const message of [" ", "a".repeat(4001)])
      expect(
        (
          await req(`/v1/submissions/${d.id}/feedback`, "POST", {
            message,
            clientRequestId: crypto.randomUUID(),
          })
        ).status
      ).toBe(400);
    expect((await (await req(`/v1/submissions/${d.id}`)).json()).data.content).toEqual(d.content);
  });
  it("预检允许PUT/PATCH与凭据", async () => {
    const r = await req("/v1/uploads", "OPTIONS");
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(r.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
  it("新库单步初始化得到当前结构，误重复初始化不会清空已有数据", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const schema = readFileSync(
        new URL("../infra/migrations/0001_submissions.sql", import.meta.url),
        "utf8"
      );
      db.exec(schema);
      const columns = db
        .prepare("PRAGMA table_info(submissions)")
        .all()
        .map(row => row.name);
      expect(columns).toContain("content_json");
      expect(columns).toContain("source_commit");
      expect(columns).not.toContain("listing_json");
      expect(
        db
          .prepare("PRAGMA table_info(uploads)")
          .all()
          .map(row => row.name)
      ).not.toContain("kind");
      expect(db.prepare("SELECT count(*) AS n FROM submission_feedback").get()?.n).toBe(0);
      db.exec(
        "INSERT INTO publishers VALUES ('1','a',''); INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES ('u','1','ready','a',1,'now')"
      );
      expect(() => db.exec(schema)).toThrow();
      expect(db.prepare("SELECT count(*) AS n FROM uploads").get()?.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
