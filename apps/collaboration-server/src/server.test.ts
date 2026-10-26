import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { readNodeDocument, replaceText } from "@tau/collaboration";
import { createServer } from "./server";

const directories: string[] = [];
const servers: Awaited<ReturnType<typeof createServer>>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.app.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
const setup = async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "tau-collaboration-test-"));
  directories.push(dataDir);
  const server = await createServer({ dataDir, logger: false });
  servers.push(server);
  await server.app.ready();
  return server;
};
const auth = (identity: { id: string; secret: string }) => ({
  authorization: `Bearer ${identity.id}:${identity.secret}`,
  "x-tau-document-version": "2",
});

describe("协作权限和持久化", () => {
  it.each([undefined, 1, 4])("拒绝发布版本 %s，不激活草稿或写入快照", async version => {
    const { app, store } = await setup();
    expect(
      (await app.inject({ method: "GET", url: "/health/ready" })).json().documentVersions
    ).toEqual([2, 3]);
    const owner = store.register("作者"),
      row = store.create(owner.id, "unsupported");
    const doc = new Y.Doc();
    if (version !== undefined) doc.getMap("meta").set("version", version);
    doc.getText("title").insert(0, "原数据");
    doc.get("content", Y.XmlText).insert(0, "旧正文");
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/documents/${row.id}/publish`,
        headers: auth(owner),
        payload: { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("UNSUPPORTED_DOCUMENT");
      expect(store.document(row.id).status).toBe("draft");
      expect(store.db.prepare("SELECT count(*) AS count FROM snapshots").get()).toEqual({
        count: 0,
      });
      expect(
        store.db.prepare("SELECT count(*) AS count FROM collaboration_protocol").get()
      ).toEqual({ count: 0 });
    } finally {
      doc.destroy();
    }
  });

  it("旧持久文档不能读取、签票或压缩，快照与资产原样保留", async () => {
    const { app, store } = await setup();
    const owner = store.register("作者"),
      row = store.create(owner.id, "stored-old");
    const doc = new Y.Doc();
    doc.getMap("meta").set("version", 1);
    doc.get("content", Y.XmlText).insert(0, "保留旧正文");
    const bytes = Buffer.from(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    store.db.prepare("INSERT INTO snapshots VALUES (?,?)").run(row.id, bytes);
    store.db.prepare("UPDATE documents SET status='active' WHERE id=?").run(row.id);
    store.insertAsset(row.id, "old-asset", "old-hash", "旧资产", "image/png", 1);
    const before = store.db.prepare("SELECT total_changes() AS count").get();
    expect(() => store.loadDocument(row.id)).toThrow("协议");
    expect(() => store.ticket(owner.id, row.id, 1)).toThrow("协议");
    expect(() => store.compact(row.id)).toThrow("协议");
    const response = await app.inject({
      method: "GET",
      url: `/v1/documents/${row.id}/state`,
      headers: auth(owner),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("UNSUPPORTED_DOCUMENT");
    expect(store.db.prepare("SELECT total_changes() AS count").get()).toEqual(before);
    expect(store.db.prepare("SELECT state FROM snapshots WHERE document_id=?").get(row.id)).toEqual(
      { state: bytes }
    );
    expect(store.db.prepare("SELECT id FROM assets").all()).toEqual([{ id: "old-asset" }]);
  });
  it("审批前无法读取，批准后可读，退出和结束共享撤销访问", async () => {
    const { app, store } = await setup();
    const owner = store.register("作者");
    const guest = store.register("访客");
    const created = store.create(owner.id, "creation-key");
    expect(store.create(owner.id, "creation-key").id).toBe(created.id);
    const doc = await createTestDocument(
      {
        title: "保密文章",
        content: [{ type: "paragraph", children: [{ text: "正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: created.id, baselineId: "base", epoch: 0 }
    );
    await store.publish(created.id, owner.id, Y.encodeStateAsUpdate(doc));
    const invitation = store.rotateCode(created.id, owner.id);
    const denied = await app.inject({
      method: "GET",
      url: `/v1/documents/${created.id}/state`,
      headers: auth(guest),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain("正文");
    const request = store.requestJoin(invitation.code, guest.id);
    expect(request.status).toBe("pending");
    expect(request).toMatchObject({ documentId: created.id });
    if (request.status !== "pending") throw new Error("未创建申请");
    store.decide(request.id, owner.id, true);
    const approved = await app.inject({
      method: "GET",
      url: `/v1/documents/${created.id}/state`,
      headers: auth(guest),
    });
    expect(approved.statusCode).toBe(200);
    store.removeMember(created.id, guest.id, guest.id);
    expect(() => store.authorize(created.id, guest.id)).toThrow("没有");
    store.closeDocument(created.id, owner.id, store.protocols.state(created.id).revision);
    expect(() => store.authorize(created.id, owner.id)).toThrow("结束");
    doc.destroy();
  });

  it("结束共享后原幂等键仍指向终态，新分享使用新键", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const first = store.create(owner.id, "recreate-after-close");

    store.closeDocument(first.id, owner.id);

    const second = store.create(owner.id, "recreate-after-close");
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("closed");
    expect(store.create(owner.id, "new-sharing-instance").id).not.toBe(first.id);
    expect(store.document(first.id).status).toBe("closed");
    expect(store.document(first.id).creation_key).toBe("recreate-after-close");
  });

  it("增量提交后可以从磁盘恢复，重复更新不会重复内容，撤权后拒绝写入", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const row = store.create(owner.id, "durable");
    const doc = await createTestDocument(
      {
        title: "初始",
        content: [{ type: "paragraph", children: [{ text: "正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: row.id, baselineId: "base", epoch: 0 }
    );
    await store.publish(row.id, owner.id, Y.encodeStateAsUpdate(doc));
    const stateVector = Y.encodeStateVector(doc);
    const current = store.loadDocument(row.id);
    replaceText(doc.getText("title"), "最新标题");
    const update = Y.encodeStateAsUpdate(doc, stateVector);
    await store.appendUpdate(row.id, owner.id, update, current);
    await store.appendUpdate(row.id, owner.id, update, current);
    const recovered = store.loadDocument(row.id);
    expect(readNodeDocument(recovered).title).toBe("最新标题");
    store.compact(row.id);
    expect(store.db.prepare("SELECT count(*) AS count FROM updates").get()).toEqual({ count: 0 });
    store.closeDocument(row.id, owner.id, store.protocols.state(row.id).revision);
    expect(() => store.appendUpdate(row.id, owner.id, update, current)).toThrow("结束");
    doc.destroy();
    current.destroy();
    recovered.destroy();
  });

  it("解除引用的资产在宽限期后被回收，仍被引用的资产保留", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const row = store.create(owner.id, "asset-gc");
    store.insertAsset(row.id, "keep-id", "keep-hash", "keep.png", "image/png", 10);
    store.insertAsset(row.id, "stale-id", "stale-hash", "stale.png", "image/png", 10);
    const doc = await createTestDocument(
      {
        title: "带资产",
        content: [{ type: "paragraph", children: [{ text: "正文" }] }],
        bannerBg: "tau-collab-asset:keep-id",
        bannerPosition: "center",
      },
      { documentId: row.id, baselineId: "base", epoch: 0 }
    );
    await store.publish(row.id, owner.id, Y.encodeStateAsUpdate(doc));
    const count = () =>
      (
        store.db.prepare("SELECT id FROM assets WHERE document_id=? ORDER BY id").all(row.id) as {
          id: string;
        }[]
      ).map(entry => entry.id);
    // 宽限期内不回收
    store.compact(row.id);
    expect(count()).toEqual(["keep-id", "stale-id"]);
    // 未被引用的资产超过宽限期后被回收，被引用的保留并刷新引用时间
    store.db
      .prepare("UPDATE assets SET last_referenced_at=? WHERE id=?")
      .run(Date.now() - 8 * 86400000, "stale-id");
    store.compact(row.id);
    expect(count()).toEqual(["keep-id"]);
    const kept = store.db
      .prepare("SELECT last_referenced_at FROM assets WHERE id=?")
      .get("keep-id") as { last_referenced_at: number };
    expect(kept.last_referenced_at).toBeGreaterThan(Date.now() - 60000);
    store.closeDocument(row.id, owner.id, store.protocols.state(row.id).revision);
    doc.destroy();
  });

  it("不能伪造票据或跨文档使用票据，并执行配额", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const first = store.create(owner.id, "0");
    const content = await createTestDocument(
      {
        title: "票据",
        content: [{ type: "paragraph", children: [{ text: "正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: first.id, baselineId: "base", epoch: 0 }
    );
    await store.publish(first.id, owner.id, Y.encodeStateAsUpdate(content));
    content.destroy();
    const ticket = store.ticket(owner.id, first.id, 2);
    expect(store.verifyTicket(ticket, first.id).id).toBe(owner.id);
    expect(() => store.verifyTicket(ticket, "second")).toThrow("过期");
    expect(() => store.verifyTicket(ticket + "x", first.id)).toThrow("无效");
    expect(() => store.ticket(owner.id, "missing")).toThrow("不存在");
    for (let i = 1; i < 5; i++) store.create(owner.id, String(i));
    expect(() => store.create(owner.id, "extra")).toThrow("上限");
  });

  it("发布含本地资源路径的内容返回 4xx 并透传原因，而非 500 兜底", async () => {
    const { app, store } = await setup();
    const owner = store.register("作者");
    const created = store.create(owner.id, "local-path");
    const doc = await createTestDocument(
      {
        title: "本地资源",
        content: [{ type: "paragraph", children: [{ text: "正文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: created.id, baselineId: "base", epoch: 0 }
    );
    doc.getMap("meta").set("bannerBg", "file:///etc/passwd");
    const response = await app.inject({
      method: "POST",
      url: `/v1/documents/${created.id}/publish`,
      headers: auth(owner),
      payload: { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(response.json().code).not.toBe("REQUEST_FAILED");
    doc.destroy();
  });
});
