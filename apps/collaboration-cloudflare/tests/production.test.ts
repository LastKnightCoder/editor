import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import * as Y from "yjs";
import {
  createNodeDocument,
  createWhiteboardDocument,
  captureScopedTextEdit,
  NodeTree,
  readNodeDocument,
  WhiteboardModel,
  type DeviceIdentity,
} from "@tau/collaboration";
import { prepareContentContract } from "../../../packages/db-schema/content-contracts";

let worker: Miniflare;
let url: string;
const key = "local-production-management";
const empty = () => ({
  format: 5,
  signingKey: randomBytes(32).toString("hex"),
  tables: {
    devices: [],
    documents: [],
    members: [],
    invitations: [],
    join_requests: [],
    assets: [],
    audit: [],
    collaboration_protocol: [],
    collaboration_asset_history: [],
    collaboration_operations: [],
    collaboration_sequences: [],
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
  it("成员退出结果可重试，作者和不存在的房间仍拒绝退出", async () => {
    await initialize();
    const owner = await register("作者");
    const guest = await register("访客");
    const id = await create(owner);
    const route = `/v1/documents/${id}`;
    const doc = await createTestDocument(
      { title: "正文", content: [], bannerBg: "", bannerPosition: "center" },
      { documentId: id, baselineId: "base", epoch: 0 }
    );
    try {
      expect(
        (
          await request(
            `${route}/publish`,
            "POST",
            {
              state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            },
            owner
          )
        ).response.status
      ).toBe(200);
    } finally {
      doc.destroy();
    }
    const { code } = (await request(`${route}/invitation`, "POST", {}, owner)).value;
    const joined = (await request("/v1/join-requests", "POST", { code }, guest)).value;
    await request(`/v1/join-requests/${joined.id}/decision`, "POST", { approve: true }, owner);
    const list = () => request("/v1/documents", "GET", undefined, guest);
    expect((await list()).value.documents).toMatchObject([
      { id, kind: "content", protocolVersion: 2 },
    ]);
    const leave = (identity = guest) => request(`${route}/leave`, "POST", {}, identity);
    expect((await leave()).value).toEqual({ ok: true });
    expect((await leave()).value).toEqual({ ok: true });
    expect((await list()).value.documents).toEqual([]);
    expect((await leave(owner)).value.code).toBe("OWNER_CANNOT_LEAVE");
    expect((await request("/v1/documents/unknown/leave", "POST", {}, guest)).response.status).toBe(
      404
    );
    const { revision } = (await request(`${route}/protocol`, "GET", undefined, owner)).value;
    expect(
      (await request(`${route}/close`, "POST", { expectedRevision: revision }, owner)).response
        .status
    ).toBe(200);
    expect((await leave()).value).toEqual({ ok: true });
  });

  it("范围编辑复用正式 Worker 队列，同段并发、重复请求和冲突均保持正文完整", async () => {
    await initialize();
    const owner = await register("作者");
    const id = await create(owner);
    const doc = await createTestDocument(
      {
        title: "共编",
        bannerBg: "",
        bannerPosition: "center",
        content: [
          { type: "paragraph", collabId: "main", children: [{ text: "甲👩‍💻乙" }] },
          { type: "paragraph", collabId: "untouched", children: [{ text: "保留整段" }] },
        ],
      },
      { documentId: id, baselineId: "scope-base", epoch: 0 }
    );
    const tree = new NodeTree(doc);
    try {
      expect(
        (
          await request(
            `/v1/documents/${id}/publish`,
            "POST",
            {
              state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            },
            owner
          )
        ).response.status
      ).toBe(200);
      const expected = readNodeDocument(doc);
      const a = captureScopedTextEdit(tree, "a", "main", 0, 1, "丙");
      const b = captureScopedTextEdit(tree, "b", "main", 6, 7, "丁");
      const send = (operationId: string, edits: (typeof a)[]) => {
        const scope = { edits };
        return request(
          `/v1/documents/${id}/operations/${operationId}`,
          "POST",
          {
            kind: "scoped-edit",
            version: 2,
            baselineId: "scope-base",
            epoch: 0,
            expiresAt: deadline,
            scope,
            updateHash: createHash("sha256").update(JSON.stringify(scope)).digest("hex"),
          },
          owner
        );
      };
      const deadline = Date.now() + 240_000;
      const oversized = { ...a, text: "超".repeat(22_000) };
      expect((await send("oversized", [oversized])).value.operation).toMatchObject({
        state: "ABORTED",
        reason: "UNDO_LIMIT",
      });
      expect((await send("unknown-undo", [oversized])).value.operation).toMatchObject({
        state: "ABORTED",
        reason: "INVALID_UNDO",
      });
      const [first, second, duplicate] = await Promise.all([
        send("first", [a]),
        send("second", [b]),
        send("first", [a]),
      ]);
      for (const result of [first, second, duplicate])
        expect(result.value.operation.state).toBe("COMMITTED");
      expect((await send("stale", [a])).value.operation).toMatchObject({
        state: "ABORTED",
        reason: "SCOPE_CONFLICT",
        conflicts: [{ opId: "a", blockId: "main" }],
      });
      const rounds = process.env.TAU_SCOPED_STRESS === "1" ? 96 : 3;
      const readState = async () => {
        const response = await fetch(url + `/v1/documents/${id}/state`, {
          headers: {
            Authorization: `Bearer ${owner.id}:${owner.secret}`,
            "x-tau-document-version": "2",
          },
        });
        expect(response.status).toBe(200);
        return (await response.json()) as { state: string; protocol: { sequence: number } };
      };
      expected.content[0].children![0].text = "丙👩‍💻丁";
      for (let round = 0; round < rounds; round++) {
        const state = await readState();
        expect(state.protocol.sequence).toBe((round + 1) * 2);
        const peer = new Y.Doc();
        Y.applyUpdate(peer, Buffer.from(state.state, "base64"));
        const current = new NodeTree(peer);
        try {
          expect(readNodeDocument(peer)).toEqual(expected);
          const left = round % 2 ? "丙" : "甲";
          const right = round % 2 ? "丁" : "乙";
          const firstEdit = captureScopedTextEdit(current, "a", "main", 0, 1, left);
          const secondEdit = captureScopedTextEdit(current, "b", "main", 6, 7, right);
          const written = await Promise.all([
            send(`left-${round}`, [firstEdit]),
            send(`right-${round}`, [secondEdit]),
            send(`left-${round}`, [firstEdit]),
          ]);
          for (const result of written) expect(result.value.operation.state).toBe("COMMITTED");
          const conflict = await send(`conflict-${round}`, [firstEdit]);
          expect(conflict.value.operation.reason).toBe("SCOPE_CONFLICT");
          expected.content[0].children![0].text = `${left}👩‍💻${right}`;
        } finally {
          current.dispose();
          peer.destroy();
        }
      }
      const final = await readState();
      expect(final.protocol.sequence).toBe((rounds + 1) * 2);
      const finalDoc = new Y.Doc();
      try {
        Y.applyUpdate(finalDoc, Buffer.from(final.state, "base64"));
        expect(readNodeDocument(finalDoc)).toEqual(expected);
      } finally {
        finalDoc.destroy();
      }
      console.log(`Worker 范围编辑压力：${(rounds + 1) * 4} 次并发、重放与冲突提交`);
    } finally {
      tree.dispose();
      doc.destroy();
    }
  });
  it.each([undefined, 1, 4])("不支持的文档版本 %s 不能发布或取得正文票据", async version => {
    await initialize();
    const owner = await register("作者"),
      id = await create(owner);
    const doc = new Y.Doc();
    if (version !== undefined) doc.getMap("meta").set("version", version);
    doc.get("content", Y.XmlText).insert(0, "旧正文");
    try {
      const result = await request(
        `/v1/documents/${id}/publish`,
        "POST",
        { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
        owner
      );
      expect(result.response.status).toBe(409);
      expect(result.value.code).toBe("UNSUPPORTED_DOCUMENT");
      expect(
        (await request("/v1/tickets", "POST", { documentId: id, protocolVersion: 1 }, owner))
          .response.ok
      ).toBe(false);
      const metadata = (await admin("export", undefined, "GET")).value;
      expect(metadata.tables.documents[0].status).toBe("draft");
      expect(metadata.tables.collaboration_protocol).toEqual([]);
      expect((await request("/health/ready")).value.documentVersions).toEqual([2, 3]);
    } finally {
      doc.destroy();
    }
  });

  it("旧快照导入被拒绝，已导入的当前快照保持原样", async () => {
    await initialize();
    const owner = await register("作者"),
      id = await create(owner);
    const doc = await createTestDocument(
      { title: "当前正文", bannerBg: "", bannerPosition: "center", content: [] },
      { documentId: id, baselineId: "base", epoch: 0 }
    );
    const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
    doc.destroy();
    expect(
      (await request(`/v1/documents/${id}/publish`, "POST", { state }, owner)).response.status
    ).toBe(200);
    const metadata = (await admin("export", undefined, "GET")).value;
    await worker.dispose();
    await startWorker();
    expect((await admin("import", metadata)).response.status).toBe(200);
    expect((await admin(`state/${id}`, { state })).response.status).toBe(200);
    const before = (await admin(`state/${id}`, undefined, "GET")).value.state;
    const old = new Y.Doc();
    old.getMap("meta").set("version", 1);
    old.get("content", Y.XmlText).insert(0, "旧正文");
    try {
      const rejected = await admin(`state/${id}`, {
        state: Buffer.from(Y.encodeStateAsUpdate(old)).toString("base64"),
      });
      expect(rejected.response.status).toBe(409);
      expect(rejected.value.code).toBe("UNSUPPORTED_DOCUMENT");
      expect((await admin(`state/${id}`, undefined, "GET")).value.state).toBe(before);
      expect((await admin("finish-import")).response.status).toBe(200);
    } finally {
      old.destroy();
    }
  });

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
      expect(exported.tables.collaboration_migrations).toEqual([]);
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

  it("格式升级接口已退役，当前文档和普通协议查询不受影响", async () => {
    await initialize();
    const owner = await register("作者"),
      id = await create(owner);
    const doc = await createNodeDocument(
      { documentId: id, baselineId: "current", epoch: 0 },
      { title: "当前文档", bannerBg: "", bannerPosition: "center", content: [] },
      {}
    );
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
      const before = (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value;
      for (const action of ["prepare", "freeze", "commit", "cancel"])
        expect(
          (
            await request(
              `/v1/documents/${id}/migrations/retired/${action}`,
              "POST",
              { expectedEpoch: 0, expiresAt: Date.now() + 60000 },
              owner
            )
          ).response.status
        ).toBe(404);
      expect(
        (await request(`/v1/documents/${id}/migrations/retired`, "GET", undefined, owner)).response
          .status
      ).toBe(404);
      expect(
        (await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)).value
      ).toEqual(before);
      const exported = (await admin("export", undefined, "GET")).value;
      expect(exported.format).toBe(6);
      expect(exported.tables.collaboration_migrations).toEqual([]);
    } finally {
      doc.destroy();
    }
  });

  it.each([1, 2, 7])("不支持的备份格式 %s 在导入写入前被拒绝", async format => {
    expect((await admin("import", { ...empty(), format })).response.status).toBe(400);
    const status = (await admin("status", undefined, "GET")).value;
    expect(status.ready).toBe(false);
    expect(status.counts.devices).toBe(0);
    await initialize();
  });

  it("备份格式必须完整声明历史账本，活动协议仍拒绝未完成迁移状态", async () => {
    const input = empty();
    for (const format of [3, 4, 6])
      expect((await admin("import", { ...input, format })).response.status).toBe(400);
    expect(
      (await admin("import", { ...input, tables: { ...input.tables, identity_merges: [] } }))
        .response.status
    ).toBe(400);
    expect(
      (
        await admin("import", {
          ...input,
          tables: { ...input.tables, collaboration_migrations: [] },
        })
      ).response.status
    ).toBe(400);
    expect(
      (
        await admin("import", {
          ...input,
          tables: {
            ...input.tables,
            collaboration_protocol: [
              {
                document_id: "old",
                value: JSON.stringify({ migrationId: "pending", frozen: true }),
              },
            ],
          },
        })
      ).response.status
    ).toBe(400);
    expect(
      (await admin("import", { ...input, tables: { ...input.tables, unknown_history: [] } }))
        .response.status
    ).toBe(400);
    expect(
      (
        await admin("import", {
          ...input,
          tables: {
            ...input.tables,
            devices: [
              { id: "device", nickname: "设备", secret_hash: "hash", banned: 0, future_field: 1 },
            ],
          },
        })
      ).response.status
    ).toBe(400);
    await initialize();
  });

  it.each([3, 4, 5, 6])(
    "备份格式 %s 保全历史、身份和正文，恢复后可继续鉴权并备份",
    async format => {
      await initialize();
      const owner = await register("当前作者"),
        retired = await register("旧设备");
      const id = await create(owner);
      const doc = await createTestDocument(
        {
          title: "保全测试",
          content: [{ type: "paragraph", children: [{ text: "原正文" }] }],
          bannerBg: "",
          bannerPosition: "center",
        },
        { documentId: id, baselineId: "base", epoch: 0 }
      );
      const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      doc.destroy();
      expect(
        (await request(`/v1/documents/${id}/publish`, "POST", { state }, owner)).response.status
      ).toBe(200);
      const source = (await admin("export", undefined, "GET")).value;
      source.format = format;
      source.tables.devices.find((device: { id: string }) => device.id === retired.id).banned = 1;
      const merges = [{ source_id: retired.id, target_id: owner.id, created_at: 1 }];
      const migrations = [
        {
          operation_id: "historical",
          document_id: id,
          value: JSON.stringify({
            id: "historical",
            documentId: id,
            actorId: retired.id,
            state: "COMMITTED",
            receipt: { documentId: id, epoch: 0, baselineId: "base", version: 2 },
          }),
        },
      ];
      if (format !== 5) source.tables.identity_merges = merges;
      else delete source.tables.identity_merges;
      if (format === 3 || format === 6) source.tables.collaboration_migrations = migrations;
      else delete source.tables.collaboration_migrations;
      await worker.dispose();
      await startWorker();
      expect((await admin("import", source)).response.status).toBe(200);
      expect((await admin(`state/${id}`, { state })).response.status).toBe(200);
      expect((await admin("finish-import")).response.status).toBe(200);
      const snapshot = await fetch(`${url}/v1/documents/${id}/state`, {
        headers: {
          authorization: `Bearer ${owner.id}:${owner.secret}`,
          "x-tau-document-version": "2",
        },
      });
      expect(snapshot.status).toBe(200);
      expect((await snapshot.json()).state).toBe(state);
      expect((await request("/v1/documents", "GET", undefined, retired)).response.status).toBe(401);
      const restored = (await admin("export", undefined, "GET")).value;
      expect(restored.signingKey).toBe(source.signingKey);
      for (const [table, rows] of Object.entries(source.tables))
        expect(restored.tables[table]).toEqual(rows);
      expect(restored.tables.identity_merges).toEqual(format === 5 ? [] : merges);
      expect(restored.tables.collaboration_migrations).toEqual(
        format === 3 || format === 6 ? migrations : []
      );
      const backup = (await admin("backup")).value;
      const bucket = await worker.getR2Bucket("BACKUPS");
      const metadata = JSON.parse(
        await (await bucket.get(backup.prefix + "/metadata.json"))!.text()
      );
      expect(metadata.format).toBe(6);
      expect(metadata.tables.identity_merges).toEqual(restored.tables.identity_merges);
      expect(metadata.tables.collaboration_migrations).toEqual(
        restored.tables.collaboration_migrations
      );
    }
  );

  it("导入完成前拒绝业务写入，开放后禁止覆盖导入", async () => {
    expect((await request("/health/ready")).response.status).toBe(503);
    expect((await request("/v1/devices", "POST", { nickname: "访客" })).response.status).toBe(503);
    expect((await request("/_admin/status")).response.status).toBe(403);
    await initialize();
    expect((await request("/health/ready")).response.status).toBe(200);
    expect((await request("/health/ready")).value).not.toHaveProperty("legacyOriginHashes");
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
    const doc = await createTestDocument(
      {
        title: "附件验证",
        content: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: id, baselineId: "base", epoch: 0 }
    );
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
      (
        await request(
          "/v1/documents/" + id + "/close",
          "POST",
          {
            expectedRevision: (
              await request(`/v1/documents/${id}/protocol`, "GET", undefined, owner)
            ).value.revision,
          },
          owner
        )
      ).response.status
    ).toBe(200);
    const assets = await worker.getR2Bucket("ASSETS");
    expect(await assets.head("assets/" + digest)).toBeNull();
    expect(
      (await request("/v1/documents/" + id + "/assets/" + assetId, "GET", undefined, owner))
        .response.status
    ).toBe(410);
  });

  it("BMP 与缺失图片 MIME 的附件均按图片类型写入 R2", async () => {
    await initialize();
    const owner = await register("作者"),
      id = await create(owner);
    const bytes = new Uint8Array(58);
    bytes.set([0x42, 0x4d]);
    bytes[2] = 58;
    bytes[10] = 54;
    bytes[14] = 40;
    bytes[18] = 1;
    bytes[22] = 1;
    bytes[26] = 1;
    bytes[28] = 24;
    for (const mime of ["image/bmp", "image/x-ms-bmp", "application/octet-stream"]) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), "photo.bmp");
      const result = await fetch(`${url}/v1/documents/${id}/assets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${owner.id}:${owner.secret}`,
          "x-asset-id": crypto.randomUUID(),
        },
        body: form,
      });
      expect(result.status).toBe(200);
      expect((await result.json()).mime).toBe("image/bmp");
    }
  });

  it("设备身份与成员状态原样导入，退役合并接口不能转移权限", async () => {
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
      ...empty().tables,
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
          closed_revision: null,
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
    };
    const doc = await createTestDocument(
      {
        title: "原有文档",
        content: [{ type: "paragraph", children: [{ type: "formatted", text: "需要保留的正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: id, baselineId: "base", epoch: 0 }
    );
    const encoded = Y.encodeStateAsUpdate(doc);
    const revision = createHash("sha256").update(encoded).digest("hex");
    const protocol = {
      id,
      ownerId: source.id,
      version: 2,
      epoch: 0,
      baselineId: "base",
      revision,
      publication: { candidateHash: revision, version: 2, baselineId: "base" },
    };
    expect(
      (
        await admin("import", {
          ...empty(),
          tables: {
            ...tables,
            collaboration_protocol: [{ document_id: id, value: JSON.stringify(protocol) }],
            collaboration_sequences: [{ document_id: id, sequence: 0 }],
          },
        })
      ).response.status
    ).toBe(200);
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
    expect((await request("/v1/devices/merge", "POST", merge, target)).response.status).toBe(404);
    const result = (await request("/v1/documents", "GET", undefined, target)).value.documents[0];
    expect(result).toMatchObject({ id, ownerId: source.id, role: "editor", title: "原有文档" });
    const original = await request("/v1/documents", "GET", undefined, source);
    expect(original.response.status).toBe(200);
    expect(original.value.documents[0]).toMatchObject({ id, ownerId: source.id, role: "owner" });
    expect((await admin("export", undefined, "GET")).value.tables.identity_merges).toEqual([]);
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
    expect((await request("/v1/documents", "GET", undefined, owner)).value.documents).toMatchObject(
      [{ id, kind: "whiteboard", protocolVersion: 3 }]
    );
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
    expect(exported.format).toBe(6);
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
