import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { handle } from "./index";
import { inspectPackage } from "./package";
import { testEnvironment } from "./testing";
import { centerHost } from "../../../tests/fixtures/plugins/center";
import { requiresSystemReview } from "../contracts/execution";

let f: ReturnType<typeof testEnvironment>;
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function skillZip(
  options: { desktop?: boolean; script?: boolean; manifest?: Record<string, unknown> } = {}
) {
  const archive = new AdmZip();
  const files: Record<string, string> = {
    "skills/guide/SKILL.md": "---\nname: guide\ndescription: 整理时加载\n---\n# 规范",
    "skills/guide/references/rules.json": '{"rules":[]}',
  };
  if (options.script) files["skills/guide/scripts/run.py"] = "print('安装保留，不在手机执行')";
  const manifest = {
    id: "test.portable",
    name: "独立技能",
    description: "规范说明",
    version: "1.0.0",
    formatVersion: 1,
    apiVersion: 1,
    ...(options.desktop
      ? { platform: "desktop", minAppVersion: "0.59.0" }
      : {
          platform: "portable",
          targets: { android: { minAppVersion: "0.2.13" }, ios: { minAppVersion: "0.2.13" } },
        }),
    categories: ["skill"],
    skills: ["guide"],
    integrity: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, digest(bytes)])
    ),
    ...options.manifest,
  };
  archive.addFile("test.portable/manifest.json", Buffer.from(JSON.stringify(manifest)));
  archive.addFile("test.portable/README.md", Buffer.from("# 独立技能"));
  for (const [name, bytes] of Object.entries(files))
    archive.addFile(`test.portable/${name}`, Buffer.from(bytes));
  return archive.toBuffer();
}
function zip(
  version = "1.0.0",
  targets: Record<string, unknown> = {
    android: { minAppVersion: "0.2.0" },
  },
  desktopBackend = false,
  editor = false
) {
  const archive = new AdmZip(),
    code = "module.exports={};";
  const manifest = {
    id: "test.portable",
    name: "跨端测试",
    description: "跨端包",
    version,
    apiVersion: 1,
    formatVersion: desktopBackend ? 2 : 3,
    platform: desktopBackend ? "desktop" : "portable",
    format: "cjs",
    main: "main.js",
    categories: ["page"],
    ...(desktopBackend && editor ? { editor: true } : {}),
    ...(desktopBackend
      ? {
          backend: {
            entry: "backend.js",
            runtime: "node",
            apiVersion: 1,
            scope: "application",
            activation: "on-demand",
            lifetime: "idle",
            reason: "测试后台",
            systemAccess: [],
          },
        }
      : {}),
    integrity: {
      "main.js": digest(code),
      ...(desktopBackend ? { "backend.js": digest(code) } : {}),
    },
    ...(desktopBackend ? { minAppVersion: "0.59.0" } : { profile: "web-v1", targets }),
  };
  archive.addFile("test.portable/manifest.json", Buffer.from(JSON.stringify(manifest)));
  archive.addFile("test.portable/main.js", Buffer.from(code));
  if (desktopBackend) archive.addFile("test.portable/backend.js", Buffer.from(code));
  archive.addFile("test.portable/README.md", Buffer.from("# 使用说明"));
  return archive.toBuffer();
}
const request = (
  path: string,
  input?: unknown,
  auth = false,
  method = input === undefined ? "GET" : "POST"
) =>
  handle(
    new Request(f.env.API_ORIGIN + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth
          ? {
              Origin: f.env.WEB_ORIGIN,
              Cookie: "tau_session=test-session",
              "X-CSRF-Token": "test-csrf",
            }
          : {}),
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    }),
    f.env
  );
async function stage(bytes = zip()) {
  const content = await inspectPackage(bytes),
    id = crypto.randomUUID(),
    time = new Date().toISOString();
  f.sqlite
    .prepare(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,object_key,sha256,content_json,created_at) VALUES(?,'author','ready','p.zip',?,?,?,?,?)"
    )
    .run(id, bytes.length, id, digest(bytes), JSON.stringify(content), time);
  f.objects.set(id, { bytes, contentType: "application/zip" });
  f.sqlite
    .prepare(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,package_upload_id,content_json,repository,source_commit,plugin_id,plugin_version,created_at,updated_at,submitted_at) VALUES(?,'author',?,'pending_review',?,?,'https://example.invalid/repo',?, 'test.portable',?,?,?,?)"
    )
    .run(
      id,
      id,
      id,
      JSON.stringify(content),
      "a".repeat(40),
      content.manifest.version,
      time,
      time,
      time
    );
  return id;
}
async function approve(bytes = zip()) {
  const id = await stage(bytes);
  const response = await request(
    `/v1/submissions/${id}/review`,
    {
      revision: 1,
      decision: "approve",
      comment: "允许上架",
      systemReviewConfirmed: true,
    },
    true
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return { id, ...result.data };
}
beforeEach(() => {
  f = testEnvironment();
  f.env.REVIEWER_GITHUB_IDS = "author";
  f.env.PORTABLE_PUBLISH_ENABLED = "true";
  f.env.PORTABLE_PLATFORMS = "desktop,android,ios";
  f.sqlite.exec(
    "INSERT INTO publishers VALUES('author','author',''); INSERT INTO plugins(id,publisher_id,repository_id,repository) VALUES('test.portable','author','1','https://example.invalid/repo');"
  );
  f.sqlite
    .prepare("INSERT INTO sessions VALUES(?,'author','unused','test-csrf',?)")
    .run(digest("test-session"), Date.now() + 60000);
});
afterEach(() => {
  f.sqlite.close();
  vi.restoreAllMocks();
});

it("格式1独立Skill按显式targets分发移动端，旧v1不会泄漏portable变体", async () => {
  const uploaded = await inspectPackage(
    skillZip({ script: true, manifest: { packageKind: "plugin" } })
  );
  expect(uploaded.manifest).toMatchObject({
    formatVersion: 1,
    platform: "portable",
    skills: ["guide"],
  });
  expect(uploaded.manifest).not.toHaveProperty("main");
  expect(uploaded.manifest).not.toHaveProperty("profile");
  expect(uploaded.manifest).not.toHaveProperty("minAppVersion");
  expect(requiresSystemReview(uploaded.manifest)).toBe(true);
  expect(uploaded.manifest.integrity).toHaveProperty("skills/guide/scripts/run.py");
  const published = await approve(skillZip({ script: true }));
  const id = published.release.id;
  expect(published.release.downloadUrl).toContain(`/v2/releases/${id}/download`);
  const release = (await (await request(`/v2/releases/${id}`)).json()).data;
  expect(release).toMatchObject({
    formatVersion: 1,
    packageKind: "skills",
    profile: null,
    targets: { android: { minAppVersion: "0.2.13" }, ios: { minAppVersion: "0.2.13" } },
    systemReviewed: true,
  });
  const host = { ...centerHost, appVersion: "0.2.13", formatVersions: [1, 3], profiles: [] };
  const resolved = (await (await request("/v2/plugins/test.portable/resolve", { host })).json())
    .data;
  expect(resolved.release.releaseId).toBe(id);
  const catalog = (await (await request("/v2/catalog/query", { platform: "android", host })).json())
    .data;
  expect(catalog.items[0].compatible.packageKind).toBe("skills");
  expect(catalog.platformCounts).toEqual({ all: 1, desktop: 0, android: 1, ios: 1 });
  expect((await (await request("/v1/releases?pluginId=test.portable")).json()).data.items).toEqual(
    []
  );
  expect((await (await request("/v1/catalog?appVersion=9.0.0")).json()).data.items).toEqual([]);
  expect((await request(`/v1/releases/${id}`)).status).toBe(404);
  expect((await request(`/v1/releases/${id}/download`)).status).toBe(404);
  expect((await request(`/v2/releases/${id}/download`)).status).toBe(200);
});

it("portable独立Skill仍受发布开关和脚本人工审核约束", async () => {
  const id = await stage(skillZip({ script: true }));
  expect(
    (
      await request(
        `/v1/submissions/${id}/review`,
        { revision: 1, decision: "approve", comment: "未确认脚本" },
        true
      )
    ).status
  ).toBe(400);
  f.env.PORTABLE_PUBLISH_ENABLED = "false";
  expect(
    (
      await request(
        `/v1/submissions/${id}/review`,
        { revision: 1, decision: "approve", comment: "确认脚本", systemReviewConfirmed: true },
        true
      )
    ).status
  ).toBe(409);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM releases").get()).toEqual({ n: 0 });
});

it("旧desktop独立Skill不会因附带targets或自填kind被改判手机支持", async () => {
  const published = await approve(
    skillZip({
      desktop: true,
      manifest: {
        targets: { android: { minAppVersion: "0.0.0" } },
        profile: "web-v1",
        packageKind: "skills",
      },
    })
  );
  const release = (await (await request(`/v2/releases/${published.release.id}`)).json()).data;
  expect(release.packageKind).toBe("skills");
  expect(release.targets).toEqual({ desktop: { minAppVersion: "0.59.0" } });
  const resolved = (
    await (
      await request("/v2/plugins/test.portable/resolve", {
        host: { ...centerHost, formatVersions: [1, 3] },
      })
    ).json()
  ).data;
  expect(resolved.release).toBeNull();
  expect(
    (await (await request("/v2/catalog/query", { platform: "android" })).json()).data.items
  ).toEqual([]);
});

it("自填skills种类不能把历史模板或可执行格式1伪造成移动包", async () => {
  const published = await approve();
  const row = f.sqlite
    .prepare("SELECT content_json FROM releases WHERE id=?")
    .get(published.release.id)!;
  const content = JSON.parse(row.content_json as string);
  for (const extra of [
    { main: "main.js" },
    { template: { protocolVersion: 1, root: "site", entries: ["index.html"] } },
  ]) {
    content.manifest = {
      id: "test.portable",
      name: "伪造",
      version: "1.0.0",
      formatVersion: 1,
      apiVersion: 1,
      platform: "portable",
      packageKind: "skills",
      skills: ["guide"],
      targets: { android: { minAppVersion: "0.2.13" } },
      ...extra,
    };
    f.sqlite
      .prepare("UPDATE releases SET content_json=?,format_version=1,profile=NULL WHERE id=?")
      .run(JSON.stringify(content), published.release.id);
    expect(
      (
        await (
          await request("/v2/catalog/query", {
            platform: "android",
            host: { ...centerHost, formatVersions: [1, 3] },
          })
        ).json()
      ).data.items
    ).toEqual([]);
    expect((await request(`/v2/releases/${published.release.id}`)).status).toBe(404);
  }
});
it("格式 3 上传严格校验，接受逐平台最低版本而非伪造顶层版本", async () => {
  const result = await inspectPackage(zip());
  expect(result.manifest.formatVersion).toBe(3);
  expect("minAppVersion" in result.manifest).toBe(false);
  await expect(inspectPackage(zip("1.0.0-beta"))).resolves.toBeDefined();
  await expect(inspectPackage(zip("1.0.0", { android: {} }))).rejects.toThrow("最低");
  const archive = new AdmZip(zip()),
    manifest = JSON.parse(archive.readAsText("test.portable/manifest.json"));
  archive.updateFile(
    "test.portable/manifest.json",
    Buffer.from(JSON.stringify({ ...manifest, documentation: "extra" }))
  );
  await expect(inspectPackage(archive.toBuffer())).resolves.toBeDefined();
  archive.updateFile(
    "test.portable/manifest.json",
    Buffer.from(JSON.stringify({ ...manifest, permissions: ["whiteboards:read"] }))
  );
  await expect(inspectPackage(archive.toBuffer())).rejects.toThrow("业务权限");
});

it("从既有 D1 schema 增量迁移会回填旧平台且不改变发布正文和外键", () => {
  const previous = testEnvironment({ portableSchema: false });
  try {
    const content = JSON.stringify({
      manifest: { formatVersion: 1, id: "old.plugin", minAppVersion: "0.59.0" },
      readme: "保留旧资料",
    });
    previous.sqlite.exec(
      "INSERT INTO publishers VALUES('author','author',''); INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES('u','author','ready','p.zip',1,'2026'); INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at) VALUES('s','author','request','approved','2026','2026');"
    );
    previous.sqlite
      .prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at,min_app_version) VALUES('r','old.plugin','1.0.0','s','u','author','object','digest',1,?,'repository','commit','published','2026','0.59.0')"
      )
      .run(content);
    previous.sqlite.exec(
      readFileSync(
        new URL("../infra/migrations/0012_portable_distribution.sql", import.meta.url),
        "utf8"
      )
    );
    expect(
      previous.sqlite.prepare("SELECT content_json,sha256 FROM releases WHERE id='r'").get()
    ).toEqual({ content_json: content, sha256: "digest" });
    expect(
      previous.sqlite
        .prepare(
          "SELECT platform,json_extract(target_json,'$.minAppVersion') AS minimum FROM release_targets"
        )
        .get()
    ).toEqual({ platform: "desktop", minimum: "0.59.0" });
    expect(previous.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    previous.sqlite.close();
  }
});

it("0013只修正明确portable的独立Skill投影，不将模板/旧代码/旧desktop包移动化", () => {
  const previous = testEnvironment({ portableSchema: false });
  try {
    previous.sqlite.exec("INSERT INTO publishers VALUES('author','author','');");
    const insert = (id: string, manifest: Record<string, unknown>) => {
      previous.sqlite
        .prepare(
          "INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES(?,'author','ready','p.zip',1,'2026')"
        )
        .run(`u-${id}`);
      previous.sqlite
        .prepare(
          "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at) VALUES(?,'author',?,'approved','2026','2026')"
        )
        .run(`s-${id}`, `request-${id}`);
      previous.sqlite
        .prepare(
          "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at,min_app_version) VALUES(?,?, '1.0.0',?,?,'author','object','digest',1,?,'repository','commit','published','2026','0.59.0')"
        )
        .run(id, id, `s-${id}`, `u-${id}`, JSON.stringify({ manifest, readme: "保留审核资料" }));
    };
    const skill = {
      formatVersion: 1,
      apiVersion: 1,
      platform: "portable",
      id: "mobile",
      name: "移动技能",
      version: "1.0.0",
      skills: ["guide"],
      targets: { android: { minAppVersion: "0.2.13" }, ios: { minAppVersion: "0.2.14" } },
    };
    insert("mobile", skill);
    insert("desktop", { ...skill, id: "desktop", platform: "desktop", minAppVersion: "0.59.0" });
    insert("executable", { ...skill, id: "executable", main: "main.js", packageKind: "skills" });
    insert("template", {
      ...skill,
      id: "template",
      template: { root: "site", entries: ["index.html"] },
      packageKind: "skills",
    });
    previous.sqlite.exec(
      readFileSync(
        new URL("../infra/migrations/0012_portable_distribution.sql", import.meta.url),
        "utf8"
      )
    );
    expect(
      previous.sqlite
        .prepare("SELECT platform FROM release_targets WHERE release_id='mobile'")
        .all()
    ).toEqual([{ platform: "desktop" }]);
    const original = previous.sqlite
      .prepare("SELECT id,content_json,sha256 FROM releases ORDER BY id")
      .all();
    previous.sqlite.exec(
      readFileSync(
        new URL("../infra/migrations/0013_portable_skill_distribution.sql", import.meta.url),
        "utf8"
      )
    );
    expect(
      previous.sqlite
        .prepare("SELECT platform FROM release_targets WHERE release_id='mobile' ORDER BY platform")
        .all()
    ).toEqual([{ platform: "android" }, { platform: "ios" }]);
    for (const id of ["desktop", "executable", "template"])
      expect(
        previous.sqlite.prepare("SELECT platform FROM release_targets WHERE release_id=?").all(id)
      ).toEqual([{ platform: "desktop" }]);
    expect(
      previous.sqlite.prepare("SELECT id,content_json,sha256 FROM releases ORDER BY id").all()
    ).toEqual(original);
    insert("future", { ...skill, id: "future" });
    expect(
      previous.sqlite
        .prepare("SELECT platform FROM release_targets WHERE release_id='future' ORDER BY platform")
        .all()
    ).toEqual([{ platform: "android" }, { platform: "ios" }]);
    expect(previous.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    previous.sqlite.close();
  }
});
it("审批不需要平台验证记录，仍绑定修订与摘要并拒绝不同决定重试", async () => {
  const id = await stage();
  const input = { revision: 1, decision: "approve", comment: "ok" };
  const first = await request(`/v1/submissions/${id}/review`, input, true);
  expect(first.status).toBe(200);
  const approved = (await first.json()).data;
  expect(approved.reviews[0]).not.toHaveProperty("platformEvidence");
  expect(
    f.sqlite.prepare("SELECT platform_evidence_json FROM submission_reviews").get()
      ?.platform_evidence_json
  ).toBeNull();
  expect(
    f.sqlite.prepare("SELECT platform_evidence_json FROM releases").get()?.platform_evidence_json
  ).toBeNull();
  expect(approved.release.state).toBe("published");
  expect((await request(`/v1/submissions/${id}/review`, input, true)).status).toBe(200);
  expect(
    (await request(`/v1/submissions/${id}/review`, { ...input, comment: "变更决定" }, true)).status
  ).toBe(409);
  expect(f.sqlite.prepare("SELECT platform FROM release_targets").all()).toEqual([
    { platform: "android" },
  ]);
  expect(f.sqlite.prepare("SELECT min_app_version FROM releases").get()?.min_app_version).toBe("");
});
it("发布开关默认关闭，不消耗审批修订；无审核者身份不得批准", async () => {
  const id = await stage();
  delete f.env.PORTABLE_PUBLISH_ENABLED;
  const input = {
    revision: 1,
    decision: "approve",
    comment: "ok",
  };
  expect((await request(`/v1/submissions/${id}/review`, input, true)).status).toBe(409);
  expect(f.sqlite.prepare("SELECT revision,status FROM submissions WHERE id=?").get(id)).toEqual({
    revision: 1,
    status: "pending_review",
  });
  expect((await request(`/v1/submissions/${id}/review`, input)).status).toBe(401);
});
it("v1 目录/历史/详情/下载隔离新格式，v2 同 ID 按平台选包", async () => {
  const old = await approve(zip("1.0.0", {}, true));
  const current = await approve(zip("2.0.0"));
  const catalog = (await (await request("/v1/catalog?appVersion=9.0.0")).json()).data;
  expect(catalog.items[0].latest.version).toBe("1.0.0");
  const history = (await (await request("/v1/releases?pluginId=test.portable")).json()).data;
  expect(history.items).toHaveLength(1);
  for (const suffix of ["", "/download"])
    expect((await request(`/v1/releases/${current.release.id}${suffix}`)).status).toBe(404);
  expect((await request(`/v1/releases/${old.release.id}/download`)).status).toBe(200);
  const android = (
    await (await request("/v2/catalog/query", { platform: "android", host: centerHost })).json()
  ).data;
  expect(android.items[0].compatible.version).toBe("2.0.0");
  const desktop = (
    await (
      await request("/v2/catalog/query", {
        platform: "desktop",
        host: { ...centerHost, platform: "desktop", formatVersions: [1, 2, 3] },
      })
    ).json()
  ).data;
  expect(desktop.items[0].compatible.version).toBe("1.0.0");
  const all = (await (await request("/v2/catalog/query", { platform: "all" })).json()).data;
  expect(all.platformCounts).toEqual({ all: 1, desktop: 1, android: 1, ios: 0 });
  expect(all.items[0].compatibility.status).toBe("unchecked");
  expect(all.items[0].compatible).toBeNull();
  expect((await request(`/v2/releases/${current.release.id}/download`)).status).toBe(200);
});
it("真实移动宿主可查询编辑器包、精确选版并下载同一摘要", async () => {
  const bytes = zip(
    "1.1.0",
    {
      android: {
        minAppVersion: "0.2.3",
      },
    },
    false,
    true
  );
  const current = await approve(bytes);
  const host = { ...centerHost, appVersion: "0.2.3" };
  const catalog = await request("/v2/catalog/query", { platform: "android", host });
  expect(catalog.status).toBe(200);
  expect((await catalog.json()).data.items[0].compatible.releaseId).toBe(current.release.id);
  const resolved = await request("/v2/plugins/test.portable/resolve", {
    host,
    releaseId: current.release.id,
  });
  expect(resolved.status).toBe(200);
  expect((await resolved.json()).data).toMatchObject({
    release: { releaseId: current.release.id, sha256: digest(bytes) },
    compatibility: { status: "compatible" },
  });
  const download = await request(`/v2/releases/${current.release.id}/download`);
  expect(download.status).toBe(200);
  expect(digest(new Uint8Array(await download.arrayBuffer()))).toBe(digest(bytes));
});

it("无兼容不回退最新，发行关闭明确说明，游标绑定条件", async () => {
  await approve();
  f.env.PORTABLE_PLATFORMS = "ios";
  const r = (
    await (await request("/v2/plugins/test.portable/resolve", { host: centerHost })).json()
  ).data;
  expect(r.release).toBeNull();
  expect(r.compatibility.reasons[0].code).toBe("DISTRIBUTION_UNAVAILABLE");
  expect((await request("/v2/catalog/query", { platform: "all", host: centerHost })).status).toBe(
    400
  );
  expect((await request("/v2/catalog/query", { platform: "all", q: 5 })).status).toBe(400);
  expect(
    (await request("/v2/catalog/query", { platform: "android", cursor: "malformed" })).status
  ).toBe(400);
  expect((await request("/v2/releases/status", { releaseIds: Array(101).fill("id") })).status).toBe(
    400
  );
});
it("撤回/禁用状态可查询但包不能下载；未发布记录不泄漏", async () => {
  const current = await approve();
  f.sqlite
    .prepare("UPDATE releases SET revoked_at='now',revoked_reason='风险' WHERE id=?")
    .run(current.release.id);
  const result = (
    await (
      await request("/v2/releases/status", { releaseIds: [current.release.id, "missing"] })
    ).json()
  ).data;
  expect(result.items).toEqual([
    { releaseId: current.release.id, status: "revoked", reason: "风险" },
    { releaseId: "missing", status: "not_found", reason: null },
  ]);
  expect((await request(`/v2/releases/${current.release.id}/download`)).status).toBe(404);
  f.sqlite
    .prepare("UPDATE releases SET revoked_at=NULL,revoked_reason=NULL WHERE id=?")
    .run(current.release.id);
  f.sqlite.exec("UPDATE plugins SET disabled_at='now',disabled_reason='停用'");
  expect(
    (await (await request("/v2/releases/status", { releaseIds: [current.release.id] })).json()).data
      .items[0].status
  ).toBe("disabled");
  expect((await request(`/v2/releases/${current.release.id}`)).status).toBe(404);
});
it("下载期间撤回会再次核验，损坏对象拒绝下载", async () => {
  const current = await approve();
  const get = f.env.RELEASES.get.bind(f.env.RELEASES);
  vi.spyOn(f.env.RELEASES, "get").mockImplementation(async (...args: Parameters<typeof get>) => {
    const result = await get(...args);
    f.sqlite.exec("UPDATE releases SET revoked_at='now'");
    return result;
  });
  expect((await request(`/v2/releases/${current.release.id}/download`)).status).toBe(404);
});

it("迁移保留旧版本与引用，目标投影与清单一致", async () => {
  const old = await approve(zip("1.0.0", {}, true));
  const current = await approve(zip("2.0.0"));
  const rows = f.sqlite
    .prepare(
      "SELECT r.id,t.platform,json_extract(t.target_json,'$.minAppVersion') AS minimum FROM releases r JOIN release_targets t ON t.release_id=r.id ORDER BY r.version"
    )
    .all();
  expect(rows).toEqual([
    { id: old.release.id, platform: "desktop", minimum: "0.59.0" },
    { id: current.release.id, platform: "android", minimum: "0.2.0" },
  ]);
  expect(f.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("跨多个候选批次仍填满平台分页，游标不能换过滤条件", async () => {
  const base = await approve();
  const row = f.sqlite.prepare("SELECT * FROM releases WHERE id=?").get(base.release.id)!;
  for (let i = 0; i < 55; i++) {
    const id = `page-${i}`,
      plugin = `test.page${i}`,
      platform = i < 52 ? "ios" : "android";
    const content = JSON.parse(row.content_json as string);
    content.manifest.id = plugin;
    content.manifest.targets = {
      [platform]: { minAppVersion: "0.2.0" },
    };
    f.sqlite
      .prepare(
        "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at) VALUES(?,'author',?,'approved','2026','2026')"
      )
      .run(id, id);
    f.sqlite
      .prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,name,description,min_app_version,categories,keywords,state,created_at,published_at) VALUES(?,?,'1.0.0',?,?,'author','unused','hash',1,?,'repo','commit','分页测试','测试','','[\"page\"]','[]','published','2026','2026-10-23')"
      )
      .run(id, plugin, id, row.package_upload_id as string, JSON.stringify(content));
  }
  const first = (
    await (await request("/v2/catalog/query", { platform: "android", limit: 2 })).json()
  ).data;
  expect(first.items).toHaveLength(2);
  expect(first.categoryCounts.page).toBe(4);
  expect(first.platformCounts).toEqual({ all: 56, desktop: 0, android: 4, ios: 52 });
  expect(first.nextCursor).toBeTruthy();
  const second = (
    await (
      await request("/v2/catalog/query", {
        platform: "android",
        limit: 2,
        cursor: first.nextCursor,
      })
    ).json()
  ).data;
  expect(second.items).toHaveLength(2);
  expect(second.categoryCounts).toBeNull();
  expect(second.platformCounts).toBeNull();
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map(item => item.pluginId)).size).toBe(4);
  expect(
    (await request("/v2/catalog/query", { platform: "ios", limit: 2, cursor: first.nextCursor }))
      .status
  ).toBe(400);
});

it("平台摘要与选版结果只返回统一新协议字段", async () => {
  const result = await approve(zip());
  const response = await request(`/v2/releases/${result.release.id}`);
  const value = (await response.json()).data;
  expect(value.targets.android).toEqual({ minAppVersion: "0.2.0" });
  expect(value.content.manifest.targets.android).toEqual({ minAppVersion: "0.2.0" });
  const catalog = await request("/v2/catalog/query", { platform: "android", host: centerHost });
  const entry = (await catalog.json()).data.items[0];
  expect(entry.compatibility).toEqual({ status: "compatible", reasons: [] });
  const rejected = await request("/v2/catalog/query", {
    platform: "android",
    host: { ...centerHost, capabilities: [] },
  });
  expect(rejected.status).toBe(200);
});

it("历史可执行格式 1 保留审计原文，但不参与当前目录和选版", async () => {
  const published = await approve();
  const releaseId = published.release.id;
  const row = f.sqlite.prepare("SELECT content_json FROM releases WHERE id=?").get(releaseId)!;
  const content = JSON.parse(row.content_json as string);
  Object.assign(content.manifest, {
    formatVersion: 1,
    platform: "desktop",
    minAppVersion: "0.59.0",
  });
  const original = JSON.stringify(content);
  f.sqlite
    .prepare(
      "UPDATE releases SET content_json=?, format_version=1, profile=NULL, targets_json=? WHERE id=?"
    )
    .run(original, JSON.stringify({ desktop: { minAppVersion: "0.59.0" } }), releaseId);
  f.sqlite
    .prepare("UPDATE release_targets SET platform='desktop' WHERE release_id=?")
    .run(releaseId);
  const result = await request("/v2/catalog/query", { platform: "desktop" });
  expect(result.status).toBe(200);
  expect((await result.json()).data.items).toEqual([]);
  expect((await request(`/v2/releases/${releaseId}`)).status).toBe(404);
  expect(
    f.sqlite.prepare("SELECT content_json FROM releases WHERE id=?").get(releaseId)?.content_json
  ).toBe(original);
});
