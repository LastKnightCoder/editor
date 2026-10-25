import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import * as Y from "yjs";
import {
  createNodeDocument,
  createWhiteboardDocument,
  WhiteboardModel,
  type DeviceIdentity,
} from "@tau/collaboration";
import { prepareContentContract } from "../../../packages/db-schema/content-contracts";

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
const startWorker = async () => {
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
};
beforeEach(startWorker);
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
  it("新文档直接按协议 2 发布并恢复，不依赖虚构的旧房间迁移", async () => {
    await initialize();
    const owner = await register("新协议作者"),
      id = await create(owner);
    const definition = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    const doc = await createNodeDocument(
      { documentId: id, baselineId: "initial", epoch: 0 },
      {
        title: "原类型共享",
        bannerBg: "",
        bannerPosition: "center",
        content: [
          {
            type: "whiteboard",
            collabId: "node",
            tauContract: definition.id,
            entityRef: { sourceId: "source", kind: "whiteboard-content", entityId: "entity" },
            children: [{ text: "" }],
          },
        ],
      },
      { [definition.id]: definition.contract }
    );
    try {
      const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      const published = await request(`/v1/documents/${id}/publish`, "POST", { state }, owner);
      expect(published.response.status).toBe(200);
      expect(published.value).toEqual({ documentId: id, published: true });
      expect(
        (await request(`/v1/documents/${id}/publish`, "POST", { state }, owner)).value
      ).toEqual(published.value);
      expect(
        (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value
      ).toMatchObject({ version: 2, epoch: 0, baselineId: "initial" });
      expect(
        (await request("/v1/tickets", "POST", { documentId: id }, owner)).response.status
      ).toBe(409);
      const exported = (await admin("export", undefined, "GET")).value;
      expect(exported.tables.collaboration_migrations).toHaveLength(0);
      await worker.dispose();
      await startWorker();
      expect((await admin("import", exported)).response.status).toBe(200);
      expect((await admin(`state/${id}`, { state })).response.status).toBe(200);
      expect((await admin("finish-import")).response.status).toBe(200);
      expect(
        (await request("/v1/tickets", "POST", { documentId: id, protocolVersion: 2 }, owner))
          .response.status
      ).toBe(200);
    } finally {
      doc.destroy();
    }
  });

  it("文档迁移、旧票据隔离及备份恢复保留终态回执", async () => {
    await initialize();
    const owner = await register("迁移作者"),
      id = await create(owner);
    const initial = createSharedDocument({
      title: "原文",
      content: [{ type: "paragraph", children: [{ text: "正文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    await request(
      `/v1/documents/${id}/publish`,
      "POST",
      { state: Buffer.from(Y.encodeStateAsUpdate(initial)).toString("base64") },
      owner
    );
    initial.destroy();
    const operation = (action: string, body: unknown = {}) =>
      request(`/v1/documents/${id}/migrations/upgrade/${action}`, "POST", body, owner);
    expect(
      (await operation("prepare", { expectedEpoch: 0, expiresAt: Date.now() + 60_000 })).response
        .status
    ).toBe(200);
    const frozen = (await operation("freeze")).value.operation;
    const prepared = await prepareContentContract("test", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const candidate = await createNodeDocument(
      { documentId: id, epoch: 1, baselineId: "baseline-2" },
      {
        title: "原文",
        content: [{ type: "paragraph", tauContract: prepared.id, children: [{ text: "正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { [prepared.id]: prepared.contract }
    );
    const state = Y.encodeStateAsUpdate(candidate);
    candidate.destroy();
    const payload = {
      expectedRevision: frozen.frozenRevision,
      candidateHash: createHash("sha256").update(state).digest("hex"),
      targetVersion: 2,
      baselineId: "baseline-2",
      state: Buffer.from(state).toString("base64"),
    };
    const committed = await operation("commit", payload);
    expect(committed.response.status).toBe(200);
    expect(committed.value.operation.state).toBe("COMMITTED");
    expect((await operation("commit", payload)).value).toEqual(committed.value);
    expect((await request("/v1/tickets", "POST", { documentId: id }, owner)).response.status).toBe(
      409
    );
    expect(
      (await request("/v1/tickets", "POST", { documentId: id, protocolVersion: 2 }, owner)).response
        .status
    ).toBe(200);
    const exported = (await admin("export", undefined, "GET")).value;
    expect(exported.format).toBe(3);
    expect(exported.tables.collaboration_migrations).toHaveLength(1);
    await worker.dispose();
    await startWorker();
    expect((await admin("import", exported)).response.status).toBe(200);
    expect((await admin(`state/${id}`, { state: payload.state })).response.status).toBe(200);
    expect((await admin("finish-import")).response.status).toBe(200);
    const restored = await request(
      `/v1/documents/${id}/migrations/upgrade`,
      "GET",
      undefined,
      owner
    );
    expect(restored.value).toEqual(committed.value);
    expect((await operation("cancel", { expectedEpoch: 0 })).value).toEqual(committed.value);
  });
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

it("白板条件提交、缺依赖与回执备份在真实 Worker SQLite 中贯通", async () => {
  await initialize();
  const owner = await register("白板"),
    id = await create(owner),
    local = new Y.Doc(),
    model = new WhiteboardModel(local);
  model.submit([{ type: "create_page", title: "页" }], {});
  const doc = await createWhiteboardDocument(
    { documentId: id, baselineId: "board", epoch: 0 },
    Y.encodeStateAsUpdate(local)
  );
  local.destroy();
  const board = new WhiteboardModel(doc);
  try {
    expect(
      (
        await request(
          `/v1/documents/${id}/publish`,
          "POST",
          { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
          owner
        )
      ).response.status
    ).toBe(200);
    const publication = (await request(`/v1/documents/${id}/publication`, "GET", undefined, owner))
      .value;
    expect(publication).toMatchObject({
      state: "COMMITTED",
      receipt: { version: 3, baselineId: "board" },
    });
    const protocol = (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value;
    expect(protocol).toMatchObject({ version: 3, sequence: 0 });
    const delta = (text: string) => {
      const vector = Y.encodeStateVector(doc);
      board.submit(
        [{ type: "edit_title", edit: { offset: board.title.length, remove: 0, text } }],
        {}
      );
      return Y.encodeStateAsUpdate(doc, vector);
    };
    const first = delta("甲"),
      second = delta("乙");
    const payload = (update: Uint8Array) => ({
      epoch: 0,
      version: 3,
      baselineId: "board",
      expiresAt: Date.now() + 60_000,
      updateHash: createHash("sha256").update(update).digest("hex"),
      update: Buffer.from(update).toString("base64"),
    });
    const pending = payload(second);
    expect(
      (await request(`/v1/documents/${id}/operations/second`, "POST", pending, owner)).value.code
    ).toBe("MISSING_DEPENDENCIES");
    expect(
      (await request(`/v1/documents/${id}/operations/second`, "GET", undefined, owner)).value
        .operation.state
    ).toBe("PENDING");
    const one = {
      ...payload(first),
      expectedRevision: protocol.revision,
      expectedSequence: protocol.sequence,
    };
    const committed = (await request(`/v1/documents/${id}/operations/first`, "POST", one, owner))
      .value.operation;
    expect(committed.state).toBe("COMMITTED");
    expect(
      (await request(`/v1/documents/${id}/operations/first`, "POST", one, owner)).value.operation
    ).toEqual(committed);
    expect(
      (
        await request(
          `/v1/documents/${id}/operations/stale`,
          "POST",
          { ...pending, expectedRevision: protocol.revision, expectedSequence: protocol.sequence },
          owner
        )
      ).value.operation
    ).toMatchObject({ state: "ABORTED", reason: "REVISION_CONFLICT" });
    expect(
      (await request(`/v1/documents/${id}/operations/second`, "POST", pending, owner)).value
        .operation.state
    ).toBe("COMMITTED");
    expect(
      (
        await request(
          `/v1/documents/${id}/publish`,
          "POST",
          { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
          owner
        )
      ).value.code
    ).toBe("PUBLICATION_CONFLICT");
    expect(
      (await request(`/v1/documents/${id}/publication/cancel`, "POST", {}, owner)).value.state
    ).toBe("COMMITTED");
    const exported = (await admin("export", undefined, "GET")).value;
    expect(exported.format).toBe(3);
    expect(exported.tables.collaboration_operations).toHaveLength(3);
    const vector = Y.encodeStateVector(doc);
    board.submit([{ type: "edit_title", edit: { offset: 0, remove: 1, text: "丙" } }], {});
    const replacement = payload(Y.encodeStateAsUpdate(doc, vector));
    const replaced = (
      await request(`/v1/documents/${id}/operations/replace`, "POST", replacement, owner)
    ).value.operation;
    expect(replaced.state).toBe("COMMITTED");
    const stateResponse = await fetch(`${url}/v1/documents/${id}/state`, {
      headers: {
        Authorization: `Bearer ${owner.id}:${owner.secret}`,
        "x-tau-document-version": "3",
      },
    });
    expect(stateResponse.status).toBe(200);
    const confirmed = (await stateResponse.json()) as { state: string };
    const revision = createHash("sha256")
      .update(Buffer.from(confirmed.state, "base64"))
      .digest("hex");
    expect(replaced.receipt.revision).toBe(revision);
    for (let i = 0; i < 3; i++)
      expect(
        (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value
      ).toMatchObject({ revision, sequence: 3 });
    const latestExport = (await admin("export", undefined, "GET")).value;
    expect(
      JSON.parse(
        latestExport.tables.collaboration_protocol.find(
          (row: { document_id: string }) => row.document_id === id
        ).value
      ).revision
    ).toBe(revision);
    const saved = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
    await worker.dispose();
    await startWorker();
    expect((await admin("import", latestExport)).response.status).toBe(200);
    expect((await admin(`state/${id}`, { state: saved })).response.status).toBe(200);
    expect((await admin("finish-import")).response.status).toBe(200);
    expect(
      (await request(`/v1/documents/${id}/operations/first`, "GET", undefined, owner)).value
        .operation
    ).toEqual(committed);
    expect(
      (await request(`/v1/documents/${id}/publication`, "GET", undefined, owner)).value
    ).toEqual(publication);
    expect(
      (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value.sequence
    ).toBe(3);
    expect(
      (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value.revision
    ).toBe(revision);
  } finally {
    board.dispose();
    doc.destroy();
  }
});
