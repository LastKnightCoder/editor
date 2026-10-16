import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { handle } from "./index";
import { inspectPackage } from "./package";
import { testEnvironment } from "./testing";
import {
  emptyListing,
  type Listing,
  type Submission,
  type Upload,
  type UploadKind,
} from "../contracts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
  "base64"
);
function packageZip(id = "test.reader", corrupt = false) {
  const code = "module.exports = { activate() {} };";
  const zip = new AdmZip();
  zip.addFile(
    `${id}/manifest.json`,
    Buffer.from(
      JSON.stringify({
        id,
        name: "阅读插件",
        version: "1.0.0",
        minAppVersion: "0.59.0",
        apiVersion: 1,
        formatVersion: 1,
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      })
    )
  );
  zip.addFile(`${id}/main.js`, Buffer.from(corrupt ? "changed" : code));
  return zip.toBuffer();
}

describe("发布门户第一期", () => {
  let fixture: ReturnType<typeof testEnvironment>;
  let cookie = "";
  let csrf = "";
  let admin = true;
  beforeEach(() => {
    fixture = testEnvironment();
    cookie = "";
    csrf = "";
    admin = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.includes("access_token"))
          return Response.json({ access_token: "test-github-token" });
        if (input.endsWith("/user"))
          return Response.json({
            id: 42,
            login: "author",
            avatar_url: "https://avatars.githubusercontent.com/u/42",
          });
        if (input.includes("/commits/")) return Response.json({ sha: "a".repeat(40) });
        return Response.json({ id: 123, private: false, permissions: { admin } });
      })
    );
  });
  afterEach(() => {
    fixture.sqlite.close();
    vi.unstubAllGlobals();
  });
  function request(
    path: string,
    method = "GET",
    input?: unknown,
    headers: Record<string, string> = {}
  ) {
    return handle(
      new Request(fixture.env.API_ORIGIN + path, {
        method,
        headers: {
          Origin: fixture.env.WEB_ORIGIN,
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
          ...headers,
        },
        body:
          input === undefined
            ? undefined
            : input instanceof Uint8Array
              ? (input as BodyInit)
              : JSON.stringify(input),
      }),
      fixture.env
    );
  }
  async function login() {
    const start = await request("/v1/auth/github");
    const target = new URL(start.headers.get("Location")!);
    const state = target.searchParams.get("state");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    cookie = `tau_oauth=${state}`;
    const callback = await request(`/v1/auth/github/callback?code=test&state=${state}`);
    expect(callback.headers.get("Location")).toBe(fixture.env.WEB_ORIGIN + "/submissions");
    cookie = callback.headers
      .getSetCookie()
      .find(x => x.startsWith("tau_session="))!
      .split(";")[0];
    const session = await (await request("/v1/session")).json();
    csrf = session.data.csrfToken;
  }
  async function upload(bytes: Buffer, kind: UploadKind = "package"): Promise<Upload> {
    const ticket = await (
      await request("/v1/uploads", "POST", { kind, size: bytes.length, fileName: "test" })
    ).json();
    const result = await request(new URL(ticket.data.uploadUrl).pathname, "PUT", bytes);
    expect(result.status).toBe(200);
    return (await result.json()).data;
  }
  async function draft(): Promise<Submission> {
    return (
      await (
        await request("/v1/submissions", "POST", { clientRequestId: crypto.randomUUID() })
      ).json()
    ).data;
  }
  async function completeDraft(): Promise<Submission> {
    const pkg = await upload(packageZip());
    const icon = await upload(png, "icon");
    const record = await draft();
    const listing: Listing = {
      ...emptyListing(),
      summary: "阅读摘录",
      description: "使用说明",
      changelog: "首次发布",
      repository: "https://github.com/author/plugin",
      commit: "a".repeat(40),
      supportUrl: "https://github.com/author/plugin/issues",
      iconUploadId: icon.id,
    };
    const result = await request(`/v1/submissions/${record.id}`, "PATCH", {
      revision: record.revision,
      packageUploadId: pkg.id,
      listing,
    });
    expect(result.status).toBe(200);
    return (await result.json()).data;
  }
  it("未登录可查询session，写入和列表要求登录", async () => {
    expect((await (await request("/v1/session")).json()).data.user).toBeNull();
    expect((await request("/v1/submissions")).status).toBe(401);
  });
  it("OAuth state错误拒绝登录，令牌仅加密保存在服务端，退出失效", async () => {
    expect(
      (await request("/v1/auth/github/callback?code=x&state=bad")).headers.get("Location")
    ).toContain("oauth_failed");
    await login();
    const row = fixture.sqlite.prepare("SELECT github_token FROM sessions").get()!;
    expect(row.github_token).not.toContain("test-github-token");
    expect((await request("/v1/logout", "POST")).status).toBe(200);
    expect((await request("/v1/submissions")).status).toBe(401);
  });
  it("写操作检查Origin和CSRF，跨域不发允许凭据头", async () => {
    await login();
    expect((await request("/v1/submissions", "POST", {}, { "X-CSRF-Token": "wrong" })).status).toBe(
      403
    );
    const bad = await request("/v1/session", "GET", undefined, { Origin: "https://other.example" });
    expect(bad.status).toBe(403);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("真实ZIP进入R2，提交冻结，重试不重复创建", async () => {
    await login();
    const record = await completeDraft();
    const submitted = await request(`/v1/submissions/${record.id}/submit`, "POST", {
      revision: record.revision,
    });
    expect(submitted.status).toBe(200);
    expect((await submitted.json()).data.status).toBe("pending_review");
    expect(fixture.objects.size).toBe(2);
    expect(
      (await request(`/v1/submissions/${record.id}/submit`, "POST", { revision: record.revision }))
        .status
    ).toBe(200);
    expect(
      (
        await request(`/v1/submissions/${record.id}`, "PATCH", {
          revision: record.revision,
          listing: record.listing,
          packageUploadId: record.packageUploadId,
        })
      ).status
    ).toBe(409);
    expect((await (await request("/v1/submissions")).json()).data.items).toHaveLength(1);
  });
  it("同一clientRequestId只创建一条草稿", async () => {
    await login();
    const input = { clientRequestId: crypto.randomUUID() };
    const first = await (await request("/v1/submissions", "POST", input)).json();
    const second = await (await request("/v1/submissions", "POST", input)).json();
    expect(first.data.id).toBe(second.data.id);
  });
  it("旧revision不能覆盖最新保存", async () => {
    await login();
    const record = await draft();
    const payload = { revision: record.revision, listing: emptyListing(), packageUploadId: null };
    expect((await request(`/v1/submissions/${record.id}`, "PATCH", payload)).status).toBe(200);
    expect((await request(`/v1/submissions/${record.id}`, "PATCH", payload)).status).toBe(409);
  });
  it("不完整资料和无仓库管理权限不能提交", async () => {
    await login();
    const empty = await draft();
    expect(
      (await request(`/v1/submissions/${empty.id}/submit`, "POST", { revision: 1 })).status
    ).toBe(400);
    const record = await completeDraft();
    admin = false;
    expect(
      (await request(`/v1/submissions/${record.id}/submit`, "POST", { revision: record.revision }))
        .status
    ).toBe(403);
    expect(fixture.sqlite.prepare("SELECT * FROM plugins").all()).toHaveLength(0);
  });
  it("已绑定其他作者的插件不能提交", async () => {
    await login();
    fixture.sqlite.exec(
      "INSERT INTO publishers VALUES ('other','other',''); INSERT INTO plugins VALUES ('test.reader','other','123')"
    );
    const record = await completeDraft();
    expect(
      (await request(`/v1/submissions/${record.id}/submit`, "POST", { revision: record.revision }))
        .status
    ).toBe(409);
  });
  it("同版本第二条提交被拒，原记录不受影响", async () => {
    await login();
    const a = await completeDraft();
    const b = await completeDraft();
    expect(
      (await request(`/v1/submissions/${a.id}/submit`, "POST", { revision: a.revision })).status
    ).toBe(200);
    expect(
      (await request(`/v1/submissions/${b.id}/submit`, "POST", { revision: b.revision })).status
    ).toBe(409);
    expect((await (await request(`/v1/submissions/${b.id}`)).json()).data.status).toBe("draft");
  });
  it("其他作者的上传和草稿不可读写", async () => {
    await login();
    const record = await completeDraft();
    fixture.sqlite.exec(
      "INSERT INTO publishers VALUES ('other','other',''); UPDATE sessions SET publisher_id='other'"
    );
    expect((await request(`/v1/submissions/${record.id}`)).status).toBe(404);
    expect((await request(`/v1/uploads/${record.packageUploadId}`)).status).toBe(404);
  });
  it("坏包保留失败信息，不写R2也不变为ready", async () => {
    await login();
    const bytes = packageZip("test.reader", true);
    const ticket = (
      await (
        await request("/v1/uploads", "POST", {
          kind: "package",
          fileName: "bad.zip",
          size: bytes.length,
        })
      ).json()
    ).data;
    expect((await request(new URL(ticket.uploadUrl).pathname, "PUT", bytes)).status).toBe(422);
    const record = (await (await request(`/v1/uploads/${ticket.upload.id}`)).json()).data;
    expect(record.status).toBe("invalid");
    expect(record.error.code).toBe("INVALID_PACKAGE");
    expect(fixture.objects.size).toBe(0);
  });
  it("ready文件不可覆盖，图片需登录读取，ZIP不可通过图片入口下载", async () => {
    await login();
    const image = await upload(png, "icon");
    expect((await request(`/v1/uploads/${image.id}/content`, "PUT", png)).status).toBe(409);
    expect((await request(`/v1/uploads/${image.id}/content`)).headers.get("Content-Type")).toBe(
      "image/png"
    );
    const pkg = await upload(packageZip());
    expect((await request(`/v1/uploads/${pkg.id}/content`)).status).toBe(404);
    cookie = "";
    expect((await request(`/v1/uploads/${image.id}/content`)).status).toBe(401);
  });
  it("拒绝超限申请和声明大小不符", async () => {
    await login();
    expect(
      (
        await request("/v1/uploads", "POST", {
          kind: "package",
          size: 9000000,
          fileName: "large.zip",
        })
      ).status
    ).toBe(413);
    const ticket = (
      await (
        await request("/v1/uploads", "POST", { kind: "icon", size: 2, fileName: "icon.png" })
      ).json()
    ).data;
    expect((await request(new URL(ticket.uploadUrl).pathname, "PUT", png)).status).toBe(413);
  });
  it("拒绝保留ID和ZIP根目录错配", async () => {
    await expect(inspectPackage(packageZip("web"))).rejects.toThrow("保留ID");
    const zip = new AdmZip(packageZip());
    zip.addFile("other/main.js", Buffer.from("wrong"));
    await expect(inspectPackage(zip.toBuffer())).rejects.toThrow("根目录");
  });
  it("R2失败记录invalid，已就绪文件不受影响", async () => {
    await login();
    const image = await upload(png, "icon");
    vi.spyOn(fixture.env.PENDING, "put").mockRejectedValueOnce(new Error("storage down"));
    const ticket = (
      await (
        await request("/v1/uploads", "POST", {
          kind: "icon",
          size: png.length,
          fileName: "icon.png",
        })
      ).json()
    ).data;
    expect((await request(new URL(ticket.uploadUrl).pathname, "PUT", png)).status).toBe(503);
    expect((await (await request(`/v1/uploads/${ticket.upload.id}`)).json()).data.status).toBe(
      "invalid"
    );
    expect((await (await request(`/v1/uploads/${image.id}`)).json()).data.status).toBe("ready");
  });
  it("并发保存只有一份成功，旧内容不会覆盖新内容", async () => {
    await login();
    const record = await draft();
    const results = await Promise.all(
      ["a", "b"].map(summary =>
        request(`/v1/submissions/${record.id}`, "PATCH", {
          revision: record.revision,
          packageUploadId: null,
          listing: { ...emptyListing(), summary },
        })
      )
    );
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await (await request(`/v1/submissions/${record.id}`)).json()).data.revision).toBe(2);
  });
  it("分页按时间稳定排序，不重复也不遗漏", async () => {
    await login();
    for (let i = 0; i < 21; i++) await draft();
    const first = (await (await request("/v1/submissions")).json()).data;
    const second = (
      await (await request(`/v1/submissions?cursor=${encodeURIComponent(first.nextCursor)}`)).json()
    ).data;
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item: Submission) => item.id)).size).toBe(
      21
    );
    expect(second.nextCursor).toBeNull();
  });
  it("字段错误返回结构化中文提示，可一次定位多个输入项", async () => {
    await login();
    const record = await completeDraft();
    const response = await request(`/v1/submissions/${record.id}`, "PATCH", {
      revision: record.revision,
      packageUploadId: record.packageUploadId,
      listing: { ...record.listing, summary: "长".repeat(161), description: 123 },
    });
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.fields.summary).toContain("简介");
    expect(error.fields.description).toContain("详细介绍");
    expect(error.requestId).toBeTruthy();
  });
  it("旧revision、冻结、重复版本与归属冲突有不同错误码", async () => {
    await login();
    const record = await completeDraft();
    const duplicate = await completeDraft();
    const stale = await request(`/v1/submissions/${record.id}/submit`, "POST", { revision: 0 });
    expect((await stale.json()).error.code).toBe("REVISION_CONFLICT");
    await request(`/v1/submissions/${record.id}/submit`, "POST", { revision: record.revision });
    const locked = await request(`/v1/submissions/${record.id}`, "PATCH", {
      revision: record.revision,
      listing: record.listing,
      packageUploadId: record.packageUploadId,
    });
    expect((await locked.json()).error.code).toBe("SUBMISSION_LOCKED");
    const conflict = await request(`/v1/submissions/${duplicate.id}/submit`, "POST", {
      revision: duplicate.revision,
    });
    expect((await conflict.json()).error.code).toBe("VERSION_ALREADY_SUBMITTED");
    fixture.sqlite.exec(
      "INSERT INTO publishers VALUES ('other','other',''); UPDATE plugins SET publisher_id='other'"
    );
    const ownership = await request(`/v1/submissions/${duplicate.id}/submit`, "POST", {
      revision: duplicate.revision,
    });
    expect((await ownership.json()).error.code).toBe("PLUGIN_OWNERSHIP_CONFLICT");
  });
  it("上传过期直接失败，已完成产物即使ticket过期也可查询恢复", async () => {
    await login();
    const image = await upload(png, "icon");
    fixture.sqlite
      .prepare("UPDATE uploads SET created_at=? WHERE id=?")
      .run(new Date(Date.now() - 7200000).toISOString(), image.id);
    const completed = await request(`/v1/uploads/${image.id}/content`, "PUT", png);
    expect((await completed.json()).error.code).toBe("UPLOAD_STATE_CONFLICT");
    const ticket = (
      await (
        await request("/v1/uploads", "POST", {
          kind: "icon",
          size: png.length,
          fileName: "icon.png",
        })
      ).json()
    ).data;
    fixture.sqlite
      .prepare("UPDATE uploads SET created_at=? WHERE id=?")
      .run(new Date(Date.now() - 7200000).toISOString(), ticket.upload.id);
    const expired = await request(new URL(ticket.uploadUrl).pathname, "PUT", png);
    expect((await expired.json()).error.code).toBe("UPLOAD_EXPIRED");
    expect(fixture.objects.size).toBe(1);
  });
  it("PUT/PATCH预检允许凭据与CSRF头，同站Cookie保持Lax", async () => {
    const preflight = await request("/v1/uploads", "OPTIONS", undefined, {
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,x-csrf-token",
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("X-CSRF-Token");
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    const start = await request("/v1/auth/github");
    expect(start.headers.get("Set-Cookie")).toContain("SameSite=Lax");
  });
  it("中断的checking记录超时可恢复为明确失败", async () => {
    await login();
    const ticket = (
      await (
        await request("/v1/uploads", "POST", {
          kind: "icon",
          size: png.length,
          fileName: "icon.png",
        })
      ).json()
    ).data;
    fixture.sqlite
      .prepare("UPDATE uploads SET status='checking',processing_at=? WHERE id=?")
      .run(Date.now() - 600000, ticket.upload.id);
    const record = (await (await request(`/v1/uploads/${ticket.upload.id}`)).json()).data;
    expect(record.status).toBe("invalid");
    expect(record.error.code).toBe("UPLOAD_NOT_READY");
  });
});
