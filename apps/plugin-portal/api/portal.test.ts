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
    minAppVersion?: string;
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
        minAppVersion: options.minAppVersion ?? "0.59.0",
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
  it("发布包校验覆盖同步后台入口，不执行入口代码", async () => {
    const archive = new AdmZip(zip());
    const manifest = JSON.parse(
      archive.getEntry("test.reader/manifest.json")!.getData().toString("utf8")
    );
    const code = "throw new Error('后台入口不能在上传时执行')";
    archive.updateFile(
      "test.reader/manifest.json",
      Buffer.from(
        JSON.stringify({
          ...manifest,
          sync: "sync.js",
          integrity: {
            ...manifest.integrity,
            "sync.js": createHash("sha256").update(code).digest("hex"),
          },
        })
      )
    );
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow();
    archive.addFile("test.reader/sync.js", Buffer.from(code));
    await expect(inspectPackage(archive.toBuffer())).resolves.toBeDefined();
    archive.updateFile("test.reader/sync.js", Buffer.from("changed"));
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow();
  });
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
  async function ready(version = "1.0.0", minAppVersion?: string): Promise<Submission> {
    const up = await upload(zip({ version, minAppVersion })),
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
  it("普通作者不能审核或发布，未批准包不可公开下载", async () => {
    await login();
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    expect(
      (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "approve",
          comment: "",
        })
      ).status
    ).toBe(403);
    expect((await req(`/v1/submissions/${d.id}/publish`, "POST")).status).toBe(403);
    expect((await (await req("/v1/releases")).json()).data.items).toHaveLength(0);
    expect((await req(`/v1/releases/${d.id}/download`)).status).toBe(404);
  });
  it("批准绑定当前修订，发布后匿名可下载，重复审核不会重复发布", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    const decision = { revision: pending.revision, decision: "approve", comment: "已验证功能" };
    const result = await req(`/v1/submissions/${d.id}/review`, "POST", decision);
    expect(result.status).toBe(200);
    const detail = (await result.json()).data;
    expect(detail.release.state).toBe("published");
    expect(detail.reviews[0]).toMatchObject({
      revision: pending.revision,
      decision: "approve",
      reviewer: { id: "42" },
    });
    expect((await req(`/v1/submissions/${d.id}/review`, "POST", decision)).status).toBe(200);
    expect(f.published.size).toBe(1);
    expect(f.sqlite.prepare("SELECT count(*) AS n FROM submission_reviews").get()?.n).toBe(1);
    cookie = "";
    const download = await req(new URL(detail.release.downloadUrl).pathname);
    expect(download.status).toBe(200);
    expect(
      createHash("sha256")
        .update(Buffer.from(await download.arrayBuffer()))
        .digest("hex")
    ).toBe(detail.release.sha256);
    expect((await (await req("/v1/releases")).json()).data.items).toHaveLength(1);
  });
  it("要求修改必须给原因，作者可同版本修订重提，旧审核不可沿用", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    expect(
      (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "request_changes",
          comment: " ",
        })
      ).status
    ).toBe(400);
    await req(`/v1/submissions/${d.id}/review`, "POST", {
      revision: pending.revision,
      decision: "request_changes",
      comment: "补充使用步骤",
    });
    const editable = (await (await req(`/v1/submissions/${d.id}`)).json()).data;
    expect(editable).toMatchObject({ status: "changes_requested", canEdit: true });
    const up = await upload(zip({ readme: "# 新使用步骤" }));
    const saved = (
      await (
        await req(`/v1/submissions/${d.id}`, "PATCH", {
          revision: editable.revision,
          packageUploadId: up.id,
          repository: editable.repository,
        })
      ).json()
    ).data;
    const again = (await (await submit(saved)).json()).data;
    expect(again.status).toBe("pending_review");
    expect(
      (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "approve",
          comment: "",
        })
      ).status
    ).toBe(409);
    const result = (
      await (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: again.revision,
          decision: "approve",
          comment: "已修复",
        })
      ).json()
    ).data;
    expect(result.release.sha256).toBe(up.sha256);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews[1].packageUploadId).toBe(d.packageUploadId);
  });
  it("拒绝后内容只读且不进入公开目录，反馈仍可使用", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    await req(`/v1/submissions/${d.id}/review`, "POST", {
      revision: pending.revision,
      decision: "reject",
      comment: "功能不符合要求",
    });
    const result = (await (await req(`/v1/submissions/${d.id}`)).json()).data;
    expect(result).toMatchObject({ status: "rejected", canEdit: false });
    expect((await submit(result)).status).toBe(409);
    expect((await req(`/v1/submissions/${d.id}/feedback`)).status).toBe(200);
    expect((await (await req("/v1/releases")).json()).data.items).toHaveLength(0);
  });
  it("并发互斥的审核只有一个生效", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    const responses = await Promise.all(
      ["approve", "reject"].map(decision =>
        req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision,
          comment: "并发审核",
        })
      )
    );
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(f.sqlite.prepare("SELECT count(*) AS n FROM submission_reviews").get()?.n).toBe(1);
  });
  it("发布失败不撤销批准，不公开半成品，可重试同一个产物", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    vi.spyOn(f.env.RELEASES, "put").mockRejectedValueOnce(new Error("unavailable"));
    const result = (
      await (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "approve",
          comment: "",
        })
      ).json()
    ).data;
    expect(result.release.state).toBe("failed");
    expect((await req(`/v1/releases/${result.release.id}/download`)).status).toBe(404);
    expect((await (await req(`/v1/submissions/${d.id}`)).json()).data.status).toBe("approved");
    const retried = (await (await req(`/v1/submissions/${d.id}/publish`, "POST")).json()).data;
    expect(retried.release.state).toBe("published");
    expect(retried.release.sha256).toBe(result.release.sha256);
    expect(retried.reviews).toHaveLength(1);
  });
  it("被替换的R2产物不能发布；过期发布租约允许恢复", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    const key = [...f.objects.keys()][0],
      original = f.objects.get(key)!;
    f.objects.set(key, { ...original, bytes: Buffer.from("tampered") });
    const result = (
      await (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "approve",
          comment: "",
        })
      ).json()
    ).data;
    expect(result.release.state).toBe("failed");
    expect(f.published.size).toBe(0);
    f.objects.set(key, original);
    f.sqlite
      .prepare("UPDATE releases SET state='publishing',lease_until=?,attempt_id='stuck'")
      .run(Date.now() - 1);
    expect(
      (await (await req(`/v1/submissions/${d.id}/publish`, "POST")).json()).data.release.state
    ).toBe("published");
  });
  it("有记录的旧数据库迁移保留提交和反馈且外键有效", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        readFileSync(new URL("../infra/migrations/0001_submissions.sql", import.meta.url), "utf8")
      );
      db.exec(
        "INSERT INTO publishers VALUES ('1','a',''); INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at,submitted_at) VALUES ('s','1','r','pending_review','now','now','now'); INSERT INTO submission_feedback VALUES ('f','s','1','r','author','已有意见','now')"
      );
      db.exec(
        readFileSync(
          new URL("../infra/migrations/0003_review_release.sql", import.meta.url),
          "utf8"
        )
      );
      expect(db.prepare("SELECT status FROM submissions WHERE id='s'").get()?.status).toBe(
        "pending_review"
      );
      expect(
        db.prepare("SELECT message FROM submission_feedback WHERE id='f'").get()?.message
      ).toBe("已有意见");
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
  it("拒绝新版本不影响已发布版本", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const first = await ready(),
      a = (await (await submit(first)).json()).data;
    const published = (
      await (
        await req(`/v1/submissions/${a.id}/review`, "POST", {
          revision: a.revision,
          decision: "approve",
          comment: "",
        })
      ).json()
    ).data.release;
    const second = await ready("1.1.0"),
      b = (await (await submit(second)).json()).data;
    await req(`/v1/submissions/${b.id}/review`, "POST", {
      revision: b.revision,
      decision: "reject",
      comment: "新版暂不通过",
    });
    expect((await req(new URL(published.downloadUrl).pathname)).status).toBe(200);
    expect(
      (await (await req("/v1/releases")).json()).data.items.map(
        (x: { version: string }) => x.version
      )
    ).toEqual(["1.0.0"]);
  });
  it("目录每个插件一条，按客户端版本选兼容版本，并公开发布者与仓库", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    for (const [version, min] of [
      ["1.0.0", "0.58.0"],
      ["1.1.0", "0.60.0"],
    ]) {
      const record = (await (await submit(await ready(version, min))).json()).data;
      await req(`/v1/submissions/${record.id}/review`, "POST", {
        revision: record.revision,
        decision: "approve",
        comment: "",
      });
    }
    cookie = "";
    const list = async (query: string) => (await (await req(`/v1/catalog?${query}`)).json()).data;
    const [entry] = (await list("appVersion=0.59.0")).items;
    expect(entry).toMatchObject({
      pluginId: "test.reader",
      name: "阅读插件",
      description: "同步阅读摘录",
      publisher: { login: "author" },
      repository: "https://github.com/author/plugin",
      latest: { version: "1.1.0", minAppVersion: "0.60.0" },
      compatible: { version: "1.0.0", minAppVersion: "0.58.0" },
    });
    expect((await list("appVersion=0.60.0-beta.1")).items[0].compatible.version).toBe("1.0.0");
    expect((await list("appVersion=0.57.0")).items[0].compatible).toBeNull();
    expect((await list("appVersion=0.60.0&q=阅读")).items[0].compatible.version).toBe("1.1.0");
    expect((await list("appVersion=0.60.0&q=日历")).items).toHaveLength(0);
    expect((await req("/v1/catalog")).status).toBe(400);
    expect((await req("/v1/catalog?appVersion=latest")).status).toBe(400);
    const detail = (await (await req(`/v1/releases/${entry.latest.releaseId}`)).json()).data;
    expect(detail).toMatchObject({
      version: "1.1.0",
      commit: "a".repeat(40),
      repository: "https://github.com/author/plugin",
      publisher: { login: "author", avatarUrl: "" },
    });
    expect(detail.content.readme).toContain("阅读插件");
  });
  it("预检允许PUT/PATCH与凭据", async () => {
    const r = await req("/v1/uploads", "OPTIONS");
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(r.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
  it("0004为已有发布记录回填目录资料列", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const run = (name: string) =>
        db.exec(readFileSync(new URL(`../infra/migrations/${name}`, import.meta.url), "utf8"));
      run("0001_submissions.sql");
      run("0003_review_release.sql");
      db.exec("PRAGMA foreign_keys=OFF");
      db.prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at) VALUES('r','p','1.0.0','s','u','42','k','h',1,?,'repo','c','published','t')"
      ).run(
        JSON.stringify({
          manifest: { name: "旧插件", description: "旧简介", minAppVersion: "0.58.0" },
        })
      );
      run("0004_release_catalog.sql");
      expect(db.prepare("SELECT name,description,min_app_version FROM releases").get()).toEqual({
        name: "旧插件",
        description: "旧简介",
        min_app_version: "0.58.0",
      });
    } finally {
      db.close();
    }
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
