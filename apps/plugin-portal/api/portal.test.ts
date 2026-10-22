import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { handle } from "./index";
import { inspectPackage } from "./package";
import { PURGE_PAGE, purgeStaleUploads } from "./uploads";
import { testEnvironment } from "./testing";
import { requiresSystemReview } from "../contracts/execution";
import type { SubmissionGroups, Submission, Upload } from "../contracts";

function zip(
  options: {
    id?: string;
    version?: string;
    minAppVersion?: string;
    readme?: string | null;
    description?: string;
    corrupt?: boolean;
    manifest?: Record<string, unknown>;
  } = {}
) {
  const file = new AdmZip(),
    id = options.id ?? "test.reader",
    code = "module.exports={activate(){}}";
  file.addFile(
    `${id}/manifest.json`,
    Buffer.from(
      JSON.stringify({
        id,
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
        ...options.manifest,
      })
    )
  );
  file.addFile(`${id}/main.js`, Buffer.from(options.corrupt ? "broken" : code));
  if (options.readme !== null)
    file.addFile(
      `${id}/README.md`,
      Buffer.from(options.readme ?? "# 阅读插件\n\n## 使用\n启用后打开侧边栏。")
    );
  return file.toBuffer();
}
describe("包资料与站内反馈", () => {
  it("后台包校验独立产物，拒绝缺失、篡改和空入口", async () => {
    const archive = new AdmZip(zip());
    const manifest = JSON.parse(archive.readAsText("test.reader/manifest.json"));
    const code = "throw new Error('上传时不得执行后台')";
    const backend = {
      entry: "backend.js",
      runtime: "node",
      apiVersion: 1,
      scope: "application",
      activation: "app-ready",
      lifetime: "persistent",
      reason: "连接设备",
      systemAccess: ["network"],
    };
    const writeManifest = (source: string) =>
      archive.updateFile(
        "test.reader/manifest.json",
        Buffer.from(
          JSON.stringify({
            ...manifest,
            formatVersion: 2,
            backend,
            integrity: {
              ...manifest.integrity,
              "backend.js": createHash("sha256").update(source).digest("hex"),
            },
          })
        )
      );
    writeManifest(code);
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow("缺少");
    archive.addFile("test.reader/backend.js", Buffer.from(code));
    await expect(inspectPackage(archive.toBuffer())).resolves.toMatchObject({
      manifest: { backend },
    });
    archive.updateFile("test.reader/backend.js", Buffer.from("changed"));
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow("摘要");
    writeManifest(" ");
    archive.updateFile("test.reader/backend.js", Buffer.from(" "));
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow("入口为空");
  });
  it("Skill 包校验 SKILL.md 摘要与 description，拒绝目录外文件", async () => {
    const skillZip = (readme: string, extra?: [string, string]) => {
      const file = new AdmZip();
      const files: Record<string, string> = { "skills/writing/SKILL.md": readme };
      if (extra) files[extra[0]] = extra[1];
      file.addFile(
        "test.writing/manifest.json",
        Buffer.from(
          JSON.stringify({
            id: "test.writing",
            name: "写作规范",
            description: "统一写作风格",
            version: "1.0.0",
            minAppVersion: "0.59.0",
            formatVersion: 1,
            apiVersion: 1,
            platform: "desktop",
            categories: ["skill"],
            skills: ["writing"],
            integrity: Object.fromEntries(
              Object.entries(files).map(([name, text]) => [
                name,
                createHash("sha256").update(text).digest("hex"),
              ])
            ),
          })
        )
      );
      for (const [name, text] of Object.entries(files))
        file.addFile(`test.writing/${name}`, Buffer.from(text));
      file.addFile("test.writing/README.md", Buffer.from("# 写作规范"));
      return file.toBuffer();
    };
    const content = await inspectPackage(
      skillZip("---\ndescription: 写文章时加载\n---\n# 规范", ["skills/writing/run.py", "print(1)"])
    );
    expect(content.manifest).toMatchObject({ skills: ["writing"], categories: ["skill"] });
    expect(requiresSystemReview(content.manifest)).toBe(true);
    await expect(inspectPackage(skillZip("# 没有 front matter"))).rejects.toThrow("description");
    const archive = new AdmZip(skillZip("---\ndescription: 写文章时加载\n---\n"));
    archive.addFile("test.writing/extra.js", Buffer.from("1"));
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow("未声明文件");
  });
  it("发布包严格校验分类与关键词", async () => {
    const content = await inspectPackage(
      zip({ manifest: { categories: ["sync", "sync"], keywords: [" MinIO "] } })
    );
    expect(content.manifest).toMatchObject({ categories: ["sync"], keywords: ["MinIO"] });
    await expect(inspectPackage(zip({ manifest: { categories: ["reading"] } }))).rejects.toThrow(
      "未知插件分类"
    );
    await expect(
      inspectPackage(zip({ manifest: { keywords: ["a", "b", "c", "d", "e", "f"] } }))
    ).rejects.toThrow("最多 5 个");
  });
  it("未知字段不成为执行入口，额外代码按未声明文件拒绝", async () => {
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
    await expect(inspectPackage(archive.toBuffer())).resolves.toBeDefined();
    archive.addFile("test.reader/sync.js", Buffer.from(code));
    await expect(inspectPackage(archive.toBuffer())).rejects.toThrow("未声明文件");
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
  /** 新协议下草稿必带已校验的包；未传时上传默认包。pluginId 走「发布新版本」预绑定。 */
  async function draft(up?: Upload, pluginId?: string): Promise<Submission> {
    const packageUploadId = (up ?? (await upload())).id;
    return (
      await (
        await req("/v1/submissions", "POST", {
          clientRequestId: crypto.randomUUID(),
          packageUploadId,
          ...(pluginId ? { pluginId } : {}),
        })
      ).json()
    ).data;
  }
  async function ready(
    version = "1.0.0",
    minAppVersion?: string,
    manifest?: Record<string, unknown>
  ): Promise<Submission> {
    const up = await upload(zip({ version, minAppVersion, manifest })),
      record = await draft(up);
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
  it("后台批准绑定明确确认，撤回立即隐藏目录和下载且保留幂等审计", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const archive = new AdmZip(zip());
    const manifest = JSON.parse(archive.readAsText("test.reader/manifest.json"));
    const code = "throw new Error('不允许上传或审核执行')";
    archive.addFile("test.reader/backend.js", Buffer.from(code));
    archive.updateFile(
      "test.reader/manifest.json",
      Buffer.from(
        JSON.stringify({
          ...manifest,
          formatVersion: 2,
          backend: {
            entry: "backend.js",
            runtime: "node",
            apiVersion: 1,
            scope: "application",
            activation: "app-ready",
            lifetime: "persistent",
            reason: "设备同步",
            systemAccess: ["network"],
          },
          integrity: {
            ...manifest.integrity,
            "backend.js": createHash("sha256").update(code).digest("hex"),
          },
        })
      )
    );
    const up = await upload(archive.toBuffer());
    const d = await draft(up);
    const saved = (
      await (
        await req(`/v1/submissions/${d.id}`, "PATCH", {
          revision: d.revision,
          packageUploadId: up.id,
          repository: "https://github.com/author/plugin",
        })
      ).json()
    ).data;
    const pending = (await (await submit(saved)).json()).data;
    const review = { revision: pending.revision, decision: "approve", comment: "已核对后台源码" };
    expect((await req(`/v1/submissions/${d.id}/review`, "POST", review)).status).toBe(400);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM releases").get()).toEqual({ n: 0 });
    const approved = (
      await (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          ...review,
          systemReviewConfirmed: true,
        })
      ).json()
    ).data;
    expect(approved.release).toMatchObject({
      state: "published",
      systemReviewed: true,
      sha256: up.sha256,
    });
    expect(approved.reviews[0]).toMatchObject({
      revision: pending.revision,
      systemReviewed: true,
      sha256: up.sha256,
    });
    const input = { reason: "发现越权访问", clientRequestId: crypto.randomUUID() };
    const revoked = await req(`/v1/submissions/${d.id}/revoke`, "POST", input);
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).data.release).toMatchObject({
      downloadUrl: null,
      revokedAt: expect.any(String),
    });
    expect((await req(`/v1/releases/${approved.release.id}`)).status).toBe(404);
    expect((await req(`/v1/releases/${approved.release.id}/download`)).status).toBe(404);
    expect((await (await req("/v1/catalog?appVersion=0.59.0")).json()).data.items).toHaveLength(0);
    expect((await req(`/v1/submissions/${d.id}/publish`, "POST")).status).toBe(409);
    expect((await req(`/v1/submissions/${d.id}/revoke`, "POST", input)).status).toBe(200);
    expect(
      (await req(`/v1/submissions/${d.id}/revoke`, "POST", { ...input, reason: "不同操作" })).status
    ).toBe(409);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM release_revocations").get()).toEqual({
      n: 1,
    });
  });
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
  it("仅未完成提交占额度，历史归组不截断，额度满时仍可幂等重试", async () => {
    await login();
    const up = await upload();
    const insert = f.sqlite.prepare(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)"
    );
    for (let i = 0; i < 120; i++)
      insert.run(
        `history-${i}`,
        "42",
        `history-${i}`,
        i % 2 ? "approved" : "rejected",
        "now",
        "now"
      );
    for (let i = 0; i < 99; i++)
      insert.run(
        `active-${i}`,
        "42",
        `active-${i}`,
        ["draft", "pending_review", "changes_requested"][i % 3],
        "now",
        "now"
      );
    const input = { clientRequestId: crypto.randomUUID(), packageUploadId: up.id };
    const created = await req("/v1/submissions", "POST", input);
    expect(created.status).toBe(201);
    const record = (await created.json()).data;
    const retry = await req("/v1/submissions", "POST", input);
    expect(retry.status).toBe(200);
    expect((await retry.json()).data.id).toBe(record.id);
    const next = { ...input, clientRequestId: crypto.randomUUID() };
    const blocked = await req("/v1/submissions", "POST", next);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toMatchObject({
      code: "LIMIT_EXCEEDED",
      message: expect.stringContaining("未完成的提交已达 100 条上限"),
    });
    const groups: SubmissionGroups = (await (await req("/v1/submission-groups")).json()).data;
    expect(groups.groups.flatMap(group => group.submissions)).toHaveLength(220);
    f.sqlite.prepare("UPDATE submissions SET status='approved' WHERE id='active-1'").run();
    expect((await req("/v1/submissions", "POST", next)).status).toBe(201);
  });
  it("README是唯一说明来源，保存表单不能覆盖包资料", async () => {
    await login();
    const up = await upload(),
      record = await draft(up);
    expect(record.content?.readme).toContain("启用后");
    const r = await req(`/v1/submissions/${record.id}`, "PATCH", {
      revision: record.revision,
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
    const d = await draft(await upload(zip({ version: "1.1.0" })));
    expect(d.repository).toBe("https://github.com/author/plugin");
    expect(d.pluginId).toBeNull();
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
  it("草稿创建幂等、必须带包、并发保存只接受一个版本", async () => {
    await login();
    expect(
      (
        await (
          await req("/v1/submissions", "POST", { clientRequestId: crypto.randomUUID() })
        ).json()
      ).error.code
    ).toBe("INVALID_INPUT");
    const input = { clientRequestId: crypto.randomUUID(), packageUploadId: (await upload()).id };
    const a = (await (await req("/v1/submissions", "POST", input)).json()).data,
      b = (await (await req("/v1/submissions", "POST", input)).json()).data;
    expect(a.id).toBe(b.id);
    expect(a.content.manifest.id).toBe("test.reader");
    // 同一请求编号换了包不是重试，不能静默返回旧草稿
    const swapped = await req("/v1/submissions", "POST", {
      ...input,
      packageUploadId: (await upload(zip({ version: "2.0.0" }))).id,
    });
    expect(swapped.status).toBe(409);
    expect((await swapped.json()).error.code).toBe("REVISION_CONFLICT");
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
    expect(f.objects.size).toBe(0);
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
    expect(f.objects.size).toBe(1);
    expect((await req(`/v1/releases/${result.release.id}/download`)).status).toBe(404);
    expect((await (await req(`/v1/submissions/${d.id}`)).json()).data.status).toBe("approved");
    const retried = (await (await req(`/v1/submissions/${d.id}/publish`, "POST")).json()).data;
    expect(retried.release.state).toBe("published");
    expect(retried.release.sha256).toBe(result.release.sha256);
    expect(retried.reviews).toHaveLength(1);
    expect(f.objects.size).toBe(0);
  });
  it("发布回收待审包后仍可下载原始包，回收的上传不可再挂到新提交", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    const before = await req(`/v1/submissions/${d.id}/package`);
    expect(before.status).toBe(200);
    const detail = (
      await (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "approve",
          comment: "",
        })
      ).json()
    ).data;
    expect(detail.release.state).toBe("published");
    expect(f.objects.size).toBe(0);
    expect(f.published.size).toBe(1);
    const after = await req(`/v1/submissions/${d.id}/package`);
    expect(after.status).toBe(200);
    expect(Buffer.from(await after.arrayBuffer())).toEqual(Buffer.from(await before.arrayBuffer()));
    expect((await (await req(`/v1/uploads/${d.packageUploadId}`)).json()).data.status).toBe(
      "invalid"
    );
    expect(
      (
        await req("/v1/submissions", "POST", {
          clientRequestId: crypto.randomUUID(),
          packageUploadId: d.packageUploadId,
        })
      ).status
    ).toBe(409);
  });
  it("发布时回收待审包失败不影响发布结果，中间态不可再用且由每日清理补扫", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await ready();
    const pending = (await (await submit(d)).json()).data;
    vi.spyOn(f.env.PENDING, "delete").mockRejectedValueOnce(new Error("unavailable"));
    const detail = (
      await (
        await req(`/v1/submissions/${d.id}/review`, "POST", {
          revision: pending.revision,
          decision: "approve",
          comment: "",
        })
      ).json()
    ).data;
    expect(detail.release.state).toBe("published");
    expect(f.objects.size).toBe(1);
    const row = () =>
      f.sqlite.prepare("SELECT status,object_key FROM uploads WHERE id=?").get(d.packageUploadId!);
    expect(row()).toMatchObject({ status: "invalid", object_key: `42/${d.packageUploadId}` });
    expect(
      (
        await req("/v1/submissions", "POST", {
          clientRequestId: crypto.randomUUID(),
          packageUploadId: d.packageUploadId,
        })
      ).status
    ).toBe(409);
    expect((await req(`/v1/submissions/${d.id}/package`)).status).toBe(200);
    await worker.scheduled(undefined, f.env);
    expect(f.objects.size).toBe(0);
    expect(row()).toMatchObject({ status: "invalid", object_key: null });
    expect((await req(`/v1/submissions/${d.id}/package`)).status).toBe(200);
  });
  it("每日清理回收已拒绝、换包遗留与未提交的待审包，保留活跃提交引用的包", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const review = async (record: Submission, decision: string) => {
      const pending = (await (await submit(record)).json()).data;
      expect(
        (
          await req(`/v1/submissions/${record.id}/review`, "POST", {
            revision: pending.revision,
            decision,
            comment: "审核意见",
          })
        ).status
      ).toBe(200);
    };
    const orphan = await upload();
    const rejected = await ready("1.0.0");
    await review(rejected, "reject");
    const changed = await ready("1.1.0");
    await review(changed, "request_changes");
    const replacement = await upload(zip({ version: "1.1.0" }));
    const current = (await (await req(`/v1/submissions/${changed.id}`)).json()).data;
    expect(
      (
        await req(`/v1/submissions/${changed.id}`, "PATCH", {
          revision: current.revision,
          packageUploadId: replacement.id,
          repository: "https://github.com/author/plugin",
        })
      ).status
    ).toBe(200);
    const waiting = await ready("1.2.0");
    expect((await submit(waiting)).status).toBe(200);
    const drafted = await draft();
    const fresh = await upload();
    f.sqlite
      .prepare("UPDATE uploads SET created_at='2020-01-01T00:00:00.000Z' WHERE id<>?")
      .run(fresh.id);
    await purgeStaleUploads(f.env);
    const statusOf = (id: string) =>
      f.sqlite.prepare("SELECT status FROM uploads WHERE id=?").get(id)?.status;
    for (const id of [orphan.id, rejected.packageUploadId!, changed.packageUploadId!]) {
      expect(statusOf(id)).toBe("invalid");
      expect(f.objects.has(`42/${id}`)).toBe(false);
    }
    for (const id of [
      replacement.id,
      waiting.packageUploadId!,
      drafted.packageUploadId!,
      fresh.id,
    ]) {
      expect(statusOf(id)).toBe("ready");
      expect(f.objects.has(`42/${id}`)).toBe(true);
    }
    expect((await req(`/v1/submissions/${rejected.id}/package`)).status).toBe(404);
  });
  it("每日清理按页批量回收，一页失败即停并留待补扫", async () => {
    await login();
    const insert = f.sqlite.prepare(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,object_key,sha256,created_at) VALUES (?,'42','ready','a.zip',1,?,'h','2020-01-01T00:00:00.000Z')"
    );
    for (let i = 0; i <= PURGE_PAGE; i++) {
      insert.run(`u${i}`, `42/u${i}`);
      f.objects.set(`42/u${i}`, { bytes: Buffer.from("x"), contentType: "application/zip" });
    }
    const count = (where: string) =>
      f.sqlite.prepare(`SELECT count(*) AS n FROM uploads WHERE ${where}`).get()?.n;
    vi.spyOn(f.env.PENDING, "delete").mockRejectedValueOnce(new Error("unavailable"));
    await purgeStaleUploads(f.env);
    expect(f.objects.size).toBe(PURGE_PAGE + 1);
    expect(count("status='invalid' AND object_key IS NOT NULL")).toBe(PURGE_PAGE);
    expect(count("status='ready'")).toBe(1);
    await purgeStaleUploads(f.env);
    expect(f.objects.size).toBe(0);
    expect(count("object_key IS NOT NULL")).toBe(0);
    expect(count("status='invalid'")).toBe(PURGE_PAGE + 1);
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
    expect(f.objects.size).toBe(0);
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
  it("目录分类与关键词取最高版本，计数同口径", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    for (const [version, manifest] of [
      ["1.0.0", { categories: ["sync"], keywords: ["旧词"] }],
      ["1.1.0", { categories: ["editor", "ai"], keywords: ["MinIO"] }],
    ] as const) {
      const record = (await (await submit(await ready(version, undefined, manifest))).json()).data;
      await req(`/v1/submissions/${record.id}/review`, "POST", {
        revision: record.revision,
        decision: "approve",
        comment: "",
      });
    }
    cookie = "";
    const list = async (query: string) =>
      (await (await req(`/v1/catalog?appVersion=0.59.0&${query}`)).json()).data;
    const all = await list("");
    expect(all.items[0]).toMatchObject({ categories: ["editor", "ai"], keywords: ["MinIO"] });
    expect(all.categoryCounts).toEqual({ editor: 1, ai: 1 });
    expect((await list("category=editor")).items).toHaveLength(1);
    expect((await list("category=sync")).items).toHaveLength(0);
    expect((await list("q=minio")).items).toHaveLength(1);
    expect((await list("q=旧词")).items).toHaveLength(0);
    expect((await list("q=旧词")).categoryCounts).toEqual({});
    expect((await req("/v1/catalog?appVersion=0.59.0&category=reading")).status).toBe(400);
  });
  it("0008为已有发布记录回填分类与关键词", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const run = (name: string) =>
        db.exec(readFileSync(new URL(`../infra/migrations/${name}`, import.meta.url), "utf8"));
      run("0001_submissions.sql");
      run("0003_review_release.sql");
      run("0004_release_catalog.sql");
      db.exec("PRAGMA foreign_keys=OFF");
      const insert = db.prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at) VALUES(?,'p',?,?,'u','42','k','h',1,?,'repo','c','published','t')"
      );
      insert.run("a", "1.0.0", "s1", JSON.stringify({ manifest: { categories: ["sync"] } }));
      insert.run("b", "1.1.0", "s2", JSON.stringify({ manifest: {} }));
      run("0008_release_categories.sql");
      expect(db.prepare("SELECT categories,keywords FROM releases ORDER BY id").all()).toEqual([
        { categories: '["sync"]', keywords: "[]" },
        { categories: "[]", keywords: "[]" },
      ]);
    } finally {
      db.close();
    }
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
  it("最新动态：无事件为null，审核与反馈按时间/ID取最新，摘要截断120字", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const created = await draft();
    expect(created.lastEvent).toBeNull();
    expect((await (await req("/v1/submissions")).json()).data.items[0].lastEvent).toBeNull();
    const d = await ready();
    expect(d.lastEvent).toBeNull();
    const pending = (await (await submit(d)).json()).data;
    expect(pending.lastEvent).toBeNull();
    await req(`/v1/submissions/${d.id}/review`, "POST", {
      revision: pending.revision,
      decision: "request_changes",
      comment: "补充使用步骤",
    });
    const feedback = (
      await (
        await req(`/v1/submissions/${d.id}/feedback`, "POST", {
          message: "长".repeat(130),
          clientRequestId: crypto.randomUUID(),
        })
      ).json()
    ).data;
    const review = f.sqlite.prepare("SELECT id FROM submission_reviews").get()!.id as string;
    const times = (reviewAt: string, feedbackAt: string) => {
      f.sqlite.prepare("UPDATE submission_reviews SET created_at=?").run(reviewAt);
      f.sqlite.prepare("UPDATE submission_feedback SET created_at=?").run(feedbackAt);
    };
    const event = async () => (await (await req(`/v1/submissions/${d.id}`)).json()).data.lastEvent;
    times("2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z");
    expect(await event()).toEqual({
      kind: "feedback",
      decision: null,
      role: "author",
      login: "author",
      excerpt: "长".repeat(120),
      createdAt: "2026-10-02T00:00:00.000Z",
    });
    times("2026-10-03T00:00:00.000Z", "2026-10-02T00:00:00.000Z");
    const latestReview = {
      kind: "review",
      decision: "request_changes",
      role: "reviewer",
      login: "author",
      excerpt: "补充使用步骤",
      createdAt: "2026-10-03T00:00:00.000Z",
    };
    expect(await event()).toEqual(latestReview);
    // 列表批量附加：两条提交各自取自己的最新动态。
    const items = (await (await req("/v1/submissions")).json()).data.items as Submission[];
    expect(items.find(item => item.id === d.id)!.lastEvent).toEqual(latestReview);
    expect(items.find(item => item.id === created.id)!.lastEvent).toBeNull();
    const editable = (await (await req(`/v1/submissions/${d.id}`)).json()).data;
    const saved = (
      await (
        await req(`/v1/submissions/${d.id}`, "PATCH", {
          revision: editable.revision,
          packageUploadId: editable.packageUploadId,
          repository: editable.repository,
        })
      ).json()
    ).data;
    expect(saved.lastEvent).toEqual(latestReview);
    times("2026-10-04T00:00:00.000Z", "2026-10-04T00:00:00.000Z");
    expect((await event()).kind).toBe(review > feedback.id ? "review" : "feedback");
    f.sqlite.prepare("UPDATE submission_feedback SET created_at=?").run("2026-10-05T00:00:00.000Z");
    const resubmitted = (await (await submit(saved)).json()).data;
    expect(resubmitted.status).toBe("pending_review");
    expect(resubmitted.lastEvent).toMatchObject({ kind: "feedback", role: "author" });
  });
  it("按插件归组：同一插件的提交合为一组，存量无包草稿单独一组，不返回包内容", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const first = await ready("1.0.0");
    const pending = (await (await submit(first)).json()).data;
    await req(`/v1/submissions/${first.id}/review`, "POST", {
      revision: pending.revision,
      decision: "approve",
      comment: "",
    });
    const second = await ready("1.1.0");
    // 旧协议遗留的空草稿仍要能展示，并以 hasPackage=false 区分。
    f.sqlite
      .prepare(
        "INSERT INTO submissions(id,publisher_id,client_request_id,created_at,updated_at) VALUES ('empty','42','empty','2026-10-02','2026-10-02')"
      )
      .run();
    f.sqlite.exec("INSERT INTO publishers VALUES ('other','other','')");
    f.sqlite
      .prepare(
        "INSERT INTO submissions(id,publisher_id,client_request_id,created_at,updated_at) VALUES ('x','other','x','2026-10-01','2026-10-01')"
      )
      .run();
    const response = await req("/v1/submission-groups");
    expect(response.status).toBe(200);
    const { groups } = (await response.json()).data as SubmissionGroups;
    expect(groups).toHaveLength(2);
    const plugin = groups.find(group => group.pluginId)!;
    expect(plugin.name).toBe(first.content!.manifest.name);
    expect(plugin.disabled).toBeNull();
    expect(plugin.submissions.map(item => [item.id, item.version, item.status])).toEqual([
      [second.id, "1.1.0", "draft"],
      [first.id, "1.0.0", "approved"],
    ]);
    expect(plugin.submissions.every(item => item.hasPackage)).toBe(true);
    expect(plugin.submissions[1].lastEvent).toMatchObject({ kind: "review", decision: "approve" });
    expect(plugin.submissions[0]).not.toHaveProperty("content");
    const drafts = groups.find(group => !group.pluginId)!;
    expect(drafts.submissions.map(item => [item.id, item.hasPackage])).toEqual([["empty", false]]);
    expect(groups.flatMap(group => group.submissions).some(item => item.id === "x")).toBe(false);
  });
  it("提交列表按状态筛选，counts覆盖整个范围且不受筛选和游标影响", async () => {
    await login();
    const insert = f.sqlite.prepare(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at,submitted_at) VALUES (?,?,?,?,?,?,?)"
    );
    const seed = (id: string, owner: string, status: string, minute: number) => {
      const time = new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString();
      insert.run(id, owner, id, status, time, time, status === "draft" ? null : time);
    };
    for (let i = 0; i < 22; i++) seed(`draft-${i}`, "42", "draft", i);
    seed("pending", "42", "pending_review", 30);
    seed("changes", "42", "changes_requested", 31);
    seed("approved", "42", "approved", 32);
    f.sqlite.exec("INSERT INTO publishers VALUES ('other','other','')");
    seed("other-draft", "other", "draft", 40);
    seed("other-pending", "other", "pending_review", 41);
    seed("other-rejected", "other", "rejected", 42);
    const page = async (query = "") => {
      const response = await req(`/v1/submissions${query}`);
      expect(response.status).toBe(200);
      return (await response.json()).data;
    };
    const mine = {
      draft: 22,
      pending_review: 1,
      changes_requested: 1,
      rejected: 0,
      approved: 1,
    };
    const all = await page();
    expect(all.counts).toEqual(mine);
    expect(all.items).toHaveLength(20);
    const drafts = await page("?status=draft");
    expect(drafts.counts).toEqual(mine);
    expect(drafts.items).toHaveLength(20);
    expect(drafts.items.every((item: Submission) => item.status === "draft")).toBe(true);
    const rest = await page(`?status=draft&cursor=${encodeURIComponent(drafts.nextCursor)}`);
    expect(rest.counts).toEqual(mine);
    expect(rest.items.map((item: Submission) => item.id)).toEqual(["draft-1", "draft-0"]);
    expect(rest.nextCursor).toBeNull();
    const changes = await page("?status=changes_requested");
    expect(changes.items.map((item: Submission) => item.id)).toEqual(["changes"]);
    expect((await page("?status=rejected")).items).toHaveLength(0);
    for (const status of ["bogus", "", "PENDING_REVIEW"]) {
      const response = await req(`/v1/submissions?status=${status}`);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_INPUT");
    }
    expect((await req("/v1/submissions?scope=review&status=pending_review")).status).toBe(403);
    f.env.REVIEWER_GITHUB_IDS = "42";
    const queue = await page("?scope=review&status=pending_review");
    expect(queue.items.map((item: Submission) => item.id)).toEqual(["other-pending", "pending"]);
    expect(queue.counts).toEqual({
      draft: 0,
      pending_review: 2,
      changes_requested: 1,
      rejected: 1,
      approved: 1,
    });
    expect((await page("?scope=review")).counts).toEqual(queue.counts);
  });
  it("发布新版本：草稿预绑定插件ID并带入仓库，包必须属于该插件，他人或未登记的插件404", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    await submit(await ready("1.0.0"));
    const create = (packageUploadId: string, pluginId: string) =>
      req("/v1/submissions", "POST", {
        clientRequestId: crypto.randomUUID(),
        packageUploadId,
        pluginId,
      });
    expect((await create((await upload()).id, "nobody.plugin")).status).toBe(404);
    f.sqlite.exec(
      "INSERT INTO publishers VALUES ('other','other','');INSERT INTO plugins(id,publisher_id,repository_id,repository) VALUES ('other.plugin','other','repo','https://github.com/other/plugin')"
    );
    expect((await create((await upload()).id, "other.plugin")).status).toBe(404);
    const wrong = await upload(zip({ id: "another.plugin", version: "2.0.0" }));
    const mismatch = await create(wrong.id, "test.reader");
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error.fields.packageUploadId).toContain("test.reader");
    const next = await draft(await upload(zip({ version: "1.1.0" })), "test.reader");
    expect(next).toMatchObject({
      pluginId: "test.reader",
      repository: "https://github.com/author/plugin",
      status: "draft",
      disabled: null,
    });
    const swap = await req(`/v1/submissions/${next.id}`, "PATCH", {
      revision: next.revision,
      packageUploadId: wrong.id,
      repository: next.repository,
    });
    expect(swap.status).toBe(400);
    expect((await swap.json()).error.message).toContain("test.reader");
    const { groups } = (await (await req("/v1/submission-groups")).json()).data as SubmissionGroups;
    expect(groups).toHaveLength(1);
    expect(groups[0].submissions.map(item => item.id)).toContain(next.id);
    expect((await submit(next)).status).toBe(200);
  });
  it("删除草稿：连同反馈一起删；审核中、有审核记录的草稿与他人记录都不可删", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const d = await draft();
    const removed = await req(`/v1/submissions/${d.id}`, "DELETE");
    expect(removed.status).toBe(200);
    expect((await removed.json()).data).toEqual({ deleted: true });
    expect((await req(`/v1/submissions/${d.id}`)).status).toBe(404);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM uploads").get()?.n).toBe(1);
    const pending = (await (await submit(await ready())).json()).data as Submission;
    expect((await (await req(`/v1/submissions/${pending.id}`, "DELETE")).json()).error.code).toBe(
      "SUBMISSION_LOCKED"
    );
    await req(`/v1/submissions/${pending.id}/review`, "POST", {
      revision: pending.revision,
      decision: "request_changes",
      comment: "请补充说明",
    });
    const changes = (await (await req(`/v1/submissions/${pending.id}`)).json()).data as Submission;
    await req(`/v1/submissions/${pending.id}/feedback`, "POST", {
      message: "收到",
      clientRequestId: crypto.randomUUID(),
    });
    const resubmitted = (await (await submit(changes)).json()).data as Submission;
    const withdrawn = (
      await (
        await req(`/v1/submissions/${pending.id}/withdraw`, "POST", {
          revision: resubmitted.revision,
        })
      ).json()
    ).data as Submission;
    expect(withdrawn.status).toBe("draft");
    expect((await (await req(`/v1/submissions/${pending.id}`, "DELETE")).json()).error.code).toBe(
      "SUBMISSION_LOCKED"
    );
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submission_feedback").get()?.n).toBe(1);
    const mine = await draft(await upload(zip({ version: "3.0.0" })));
    f.sqlite.exec(
      "INSERT INTO publishers VALUES ('other','other',''); UPDATE sessions SET publisher_id='other'"
    );
    expect((await req(`/v1/submissions/${mine.id}`, "DELETE")).status).toBe(404);
  });
  it("撤回：审核中的提交回到草稿并释放版本号，撤回后再次提交成功，与审核决定互斥", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const first = await ready("1.0.0");
    const pending = (await (await submit(first)).json()).data as Submission;
    expect(
      (await (await req(`/v1/submissions/${first.id}/withdraw`, "POST", { revision: 1 })).json())
        .error.code
    ).toBe("REVISION_CONFLICT");
    const withdraw = await req(`/v1/submissions/${first.id}/withdraw`, "POST", {
      revision: pending.revision,
    });
    expect(withdraw.status).toBe(200);
    const withdrawn = (await withdraw.json()).data as Submission;
    expect(withdrawn).toMatchObject({
      status: "draft",
      canEdit: true,
      pluginId: "test.reader",
      revision: pending.revision + 1,
    });
    expect(withdrawn.submittedAt).toBe(pending.submittedAt);
    // 再次撤回幂等返回当前草稿；审核者对旧修订的决定被拒绝
    expect(
      (await req(`/v1/submissions/${first.id}/withdraw`, "POST", { revision: 0 })).status
    ).toBe(200);
    expect(
      (
        await (
          await req(`/v1/submissions/${first.id}/review`, "POST", {
            revision: pending.revision,
            decision: "approve",
            comment: "",
          })
        ).json()
      ).error.code
    ).toBe("REVISION_CONFLICT");
    // 版本号已释放：另一条同版本提交可以进入审核，原草稿再提交则撞版本
    const another = await ready("1.0.0");
    expect((await submit(another)).status).toBe(200);
    expect((await (await submit(withdrawn)).json()).error.code).toBe("VERSION_ALREADY_SUBMITTED");
    // 已批准、已拒绝的记录不能撤回
    const approved = (await (await req(`/v1/submissions/${another.id}`)).json()).data as Submission;
    await req(`/v1/submissions/${another.id}/review`, "POST", {
      revision: approved.revision,
      decision: "approve",
      comment: "",
    });
    const done = (await (await req(`/v1/submissions/${another.id}`)).json()).data as Submission;
    expect(
      (
        await (
          await req(`/v1/submissions/${another.id}/withdraw`, "POST", { revision: done.revision })
        ).json()
      ).error.code
    ).toBe("SUBMISSION_LOCKED");
  });
  it("禁用期间作者仍可提交整改版本并获批准，但目录直到恢复才可见", async () => {
    await login();
    f.env.REVIEWER_GITHUB_IDS = "42";
    const first = (await (await submit(await ready("1.0.0"))).json()).data as Submission;
    await req(`/v1/submissions/${first.id}/review`, "POST", {
      revision: first.revision,
      decision: "approve",
      comment: "",
    });
    const catalogIds = async () =>
      (await (await req("/v1/catalog?appVersion=0.59.0")).json()).data.items.map(
        (item: { pluginId: string }) => item.pluginId
      );
    expect(await catalogIds()).toEqual(["test.reader"]);
    const act = (action: string) =>
      req("/v1/moderation/plugin-actions", "POST", {
        pluginId: "test.reader",
        action,
        reason: "README 含外链广告，请移除",
        clientRequestId: crypto.randomUUID(),
      });
    expect((await act("disable_plugin")).status).toBe(200);
    expect(await catalogIds()).toEqual([]);
    const fixed = await draft(await upload(zip({ version: "1.0.1" })), "test.reader");
    expect(fixed.disabled).toMatchObject({ reason: "README 含外链广告，请移除" });
    const pending = (await (await submit(fixed)).json()).data as Submission;
    expect(pending.status).toBe("pending_review");
    const review = await req(`/v1/submissions/${fixed.id}/review`, "POST", {
      revision: pending.revision,
      decision: "approve",
      comment: "",
    });
    expect(review.status).toBe(200);
    expect((await review.json()).data.release.state).toBe("published");
    expect(await catalogIds()).toEqual([]);
    expect((await act("enable_plugin")).status).toBe(200);
    expect(await catalogIds()).toEqual(["test.reader"]);
    const versions = (await (await req("/v1/releases?pluginId=test.reader")).json()).data.items;
    expect(versions.map((item: { version: string }) => item.version).sort()).toEqual([
      "1.0.0",
      "1.0.1",
    ]);
  });
  it("撤回过但从未进入审核的草稿可删除，站内反馈随之清除", async () => {
    await login();
    const record = await ready();
    const pending = (await (await submit(record)).json()).data as Submission;
    expect(
      (
        await req(`/v1/submissions/${record.id}/feedback`, "POST", {
          message: "先撤回，稍后补充说明",
          clientRequestId: crypto.randomUUID(),
        })
      ).status
    ).toBe(201);
    const withdrawn = (
      await (
        await req(`/v1/submissions/${record.id}/withdraw`, "POST", { revision: pending.revision })
      ).json()
    ).data as Submission;
    expect(withdrawn.status).toBe("draft");
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submission_feedback").get()?.n).toBe(1);
    const removed = await req(`/v1/submissions/${record.id}`, "DELETE");
    expect(removed.status).toBe(200);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submission_feedback").get()?.n).toBe(0);
    expect((await req(`/v1/submissions/${record.id}`)).status).toBe(404);
  });
});
