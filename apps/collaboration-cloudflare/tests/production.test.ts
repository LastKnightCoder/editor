import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import * as Y from "yjs";
import { createSharedDocument, type DeviceIdentity } from "@tau/collaboration";

let worker: Miniflare;
let url: string;
const key = "local-production-management";
const empty = () => ({
  format: 1,
  signingKey: randomBytes(32).toString("hex"),
  tables: {
    devices: [],
    documents: [],
    members: [],
    invitations: [],
    join_requests: [],
    assets: [],
    audit: [],
    identity_merges: [],
  },
});
beforeEach(async () => {
  worker = new Miniflare(
    convertV4MiniflareOptions({
      name: "production-test",
      modules: true,
      scriptPath: resolve("dist-production/index.js"),
      compatibilityDate: "2026-10-18",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { COLLAB: { className: "CollaborationService", useSQLite: true } },
      r2Buckets: ["ASSETS", "BACKUPS"],
      bindings: {
        MODE: "production",
        ADMIN_KEY: key,
        PUBLIC_URL: "https://collab.taunote.app",
        INSTANCE_NAME: crypto.randomUUID(),
        BUILD_REV: "test",
      },
      host: "127.0.0.1",
      port: 0,
    })
  );
  url = (await worker.ready).origin;
});
afterEach(async () => {
  await worker?.dispose();
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  identity?: DeviceIdentity,
  admin = false
) {
  const form = body instanceof FormData;
  const response = await fetch(url + path, {
    method,
    headers: {
      Connection: "close",
      ...(!form ? { "Content-Type": "application/json" } : {}),
      ...(identity ? { Authorization: "Bearer " + identity.id + ":" + identity.secret } : {}),
      ...(admin ? { "x-admin-key": key } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const value = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : new Uint8Array(await response.arrayBuffer());
  return { response, value };
}
const admin = (path: string, body?: unknown, method = "POST") =>
  request("/_admin/" + path, method, body, undefined, true);
async function initialize() {
  expect((await admin("import", empty())).response.status).toBe(200);
  expect((await admin("finish-import")).response.status).toBe(200);
}
async function register(nickname: string): Promise<DeviceIdentity> {
  const result = await request("/v1/devices", "POST", { nickname });
  expect(result.response.status).toBe(200);
  return result.value;
}
async function create(owner: DeviceIdentity) {
  return (await request("/v1/documents", "POST", { idempotencyKey: crypto.randomUUID() }, owner))
    .value.id as string;
}

describe("正式 Cloudflare 协作能力", () => {
  it("导入完成前拒绝业务写入，开放后禁止覆盖导入", async () => {
    expect((await request("/health/ready")).response.status).toBe(503);
    expect((await request("/v1/devices", "POST", { nickname: "访客" })).response.status).toBe(503);
    expect((await request("/_admin/status")).response.status).toBe(403);
    await initialize();
    expect((await request("/health/ready")).response.status).toBe(200);
    await register("正式客户端");
    expect((await admin("import", empty())).response.status).toBe(409);
  });

  it("R2 附件隔离、重试幂等、配额检查及结束共享清理", async () => {
    await initialize();
    const owner = await register("作者"),
      guest = await register("访客");
    const id = await create(owner),
      assetId = crypto.randomUUID();
    const bytes = new TextEncoder().encode("test-pdf-attachment");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), "资料.pdf");
    const uploaded = await fetch(url + "/v1/documents/" + id + "/assets", {
      method: "POST",
      headers: { Authorization: "Bearer " + owner.id + ":" + owner.secret, "x-asset-id": assetId },
      body: form,
    });
    expect(uploaded.status).toBe(200);
    expect((await uploaded.json()).id).toBe(assetId);
    expect(
      (await request("/v1/documents/" + id + "/assets/" + assetId, "GET", undefined, guest))
        .response.status
    ).toBe(403);
    const doc = createSharedDocument({
      title: "附件验证",
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    try {
      expect(
        (
          await request(
            "/v1/documents/" + id + "/publish",
            "POST",
            { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
            owner
          )
        ).response.status
      ).toBe(200);
    } finally {
      doc.destroy();
    }
    const download = await request(
      "/v1/documents/" + id + "/assets/" + assetId,
      "GET",
      undefined,
      owner
    );
    expect(download.response.status).toBe(200);
    expect(new TextDecoder().decode(download.value)).toBe("test-pdf-attachment");
    const again = new FormData();
    again.append("file", new Blob([bytes], { type: "application/pdf" }), "资料.pdf");
    const repeated = await fetch(url + "/v1/documents/" + id + "/assets", {
      method: "POST",
      headers: { Authorization: "Bearer " + owner.id + ":" + owner.secret, "x-asset-id": assetId },
      body: again,
    });
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).id).toBe(assetId);
    expect((await admin("status", undefined, "GET")).value.counts.assets).toBe(1);
    const backup = await admin("backup");
    expect(backup.response.status).toBe(200);
    const backups = await worker.getR2Bucket("BACKUPS");
    expect(await backups.head(backup.value.prefix + "/manifest.json")).not.toBeNull();
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(await backups.head(backup.value.prefix + "/assets/" + digest)).not.toBeNull();
    expect(
      (await request("/v1/documents/" + id + "/close", "POST", undefined, owner)).response.status
    ).toBe(200);
    const assets = await worker.getR2Bucket("ASSETS");
    expect(await assets.head("assets/" + digest)).toBeNull();
    expect(
      (await request("/v1/documents/" + id + "/assets/" + assetId, "GET", undefined, owner))
        .response.status
    ).toBe(410);
  });

  it("旧设备身份、成员状态与文档无损导入，身份合并可安全重试", async () => {
    const source = {
      id: crypto.randomUUID(),
      secret: randomBytes(32).toString("hex"),
      nickname: "原设备",
    };
    const target = {
      id: crypto.randomUUID(),
      secret: randomBytes(32).toString("hex"),
      nickname: "产品端点设备",
    };
    const id = crypto.randomUUID(),
      now = Date.now();
    const tables = {
      devices: [source, target].map(device => ({
        id: device.id,
        nickname: device.nickname,
        secret_hash: createHash("sha256").update(device.secret).digest("hex"),
        banned: 0,
        created_at: now,
      })),
      documents: [
        {
          id,
          owner_id: source.id,
          title: "原有文档",
          status: "active",
          creation_key: "preserved",
          updated_at: now,
          created_at: now,
        },
      ],
      members: [
        { document_id: id, device_id: source.id, role: "owner", status: "active" },
        { document_id: id, device_id: target.id, role: "editor", status: "active" },
      ],
      invitations: [],
      join_requests: [],
      assets: [],
      audit: [],
      identity_merges: [],
    };
    expect(
      (await admin("import", { format: 1, signingKey: randomBytes(32).toString("hex"), tables }))
        .response.status
    ).toBe(200);
    const doc = createSharedDocument({
      title: "原有文档",
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "需要保留的正文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    try {
      expect(
        (
          await admin("state/" + id, {
            state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
          })
        ).response.status
      ).toBe(200);
    } finally {
      doc.destroy();
    }
    expect((await admin("finish-import")).response.status).toBe(200);
    expect((await request("/v1/documents", "GET", undefined, source)).value.documents[0].id).toBe(
      id
    );
    const merge = { sourceId: source.id, sourceSecret: source.secret };
    expect(
      (await request("/v1/devices/merge", "POST", { ...merge, sourceSecret: "wrong" }, target))
        .response.status
    ).toBe(401);
    expect((await request("/v1/devices/merge", "POST", merge, target)).response.status).toBe(200);
    expect((await request("/v1/devices/merge", "POST", merge, target)).response.status).toBe(200);
    const result = (await request("/v1/documents", "GET", undefined, target)).value.documents[0];
    expect(result).toMatchObject({ id, ownerId: target.id, role: "owner", title: "原有文档" });
    expect((await request("/v1/documents", "GET", undefined, source)).response.status).toBe(401);
    expect((await admin("backup")).response.status).toBe(200);
  });
});
