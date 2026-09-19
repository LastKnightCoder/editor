import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { createSharedDocument, readSharedContent, replaceText } from "@tau/collaboration";
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
});

describe("协作权限和持久化", () => {
  it("审批前无法读取，批准后可读，退出和结束共享撤销访问", async () => {
    const { app, store } = await setup();
    const owner = store.register("作者");
    const guest = store.register("访客");
    const created = store.create(owner.id, "creation-key");
    expect(store.create(owner.id, "creation-key").id).toBe(created.id);
    const doc = createSharedDocument({
      title: "保密文章",
      content: [{ type: "paragraph", children: [{ text: "正文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    store.publish(created.id, owner.id, Y.encodeStateAsUpdate(doc));
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
    store.closeDocument(created.id, owner.id);
    expect(() => store.authorize(created.id, owner.id)).toThrow("结束");
    doc.destroy();
  });

  it("结束共享后可使用同一幂等键重新发起", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const first = store.create(owner.id, "recreate-after-close");

    store.closeDocument(first.id, owner.id);

    const second = store.create(owner.id, "recreate-after-close");
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("draft");
    expect(store.document(first.id).status).toBe("closed");
    expect(store.document(first.id).creation_key).toContain(`:closed:${first.id}`);
  });

  it("增量提交后可以从磁盘恢复，重复更新不会重复内容，撤权后拒绝写入", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const row = store.create(owner.id, "durable");
    const doc = createSharedDocument({
      title: "初始",
      content: [{ type: "paragraph", children: [{ text: "正文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    store.publish(row.id, owner.id, Y.encodeStateAsUpdate(doc));
    const stateVector = Y.encodeStateVector(doc);
    const current = store.loadDocument(row.id);
    replaceText(doc.getText("title"), "最新标题");
    const update = Y.encodeStateAsUpdate(doc, stateVector);
    store.appendUpdate(row.id, owner.id, update, current);
    store.appendUpdate(row.id, owner.id, update, current);
    const recovered = store.loadDocument(row.id);
    expect(readSharedContent(recovered).title).toBe("最新标题");
    store.compact(row.id);
    expect(store.db.prepare("SELECT count(*) AS count FROM updates").get()).toEqual({ count: 0 });
    store.closeDocument(row.id, owner.id);
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
    const doc = createSharedDocument({
      title: "带资产",
      content: [{ type: "paragraph", children: [{ text: "正文" }] }],
      bannerBg: "tau-collab-asset:keep-id",
      bannerPosition: "center",
    });
    store.publish(row.id, owner.id, Y.encodeStateAsUpdate(doc));
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
    store.closeDocument(row.id, owner.id);
    doc.destroy();
  });

  it("不能伪造票据或跨文档使用票据，并执行配额", async () => {
    const { store } = await setup();
    const owner = store.register("作者");
    const ticket = store.ticket(owner.id, "first");
    expect(store.verifyTicket(ticket, "first").id).toBe(owner.id);
    expect(() => store.verifyTicket(ticket, "second")).toThrow("过期");
    expect(() => store.verifyTicket(ticket + "x", "first")).toThrow("无效");
    for (let i = 0; i < 5; i++) store.create(owner.id, String(i));
    expect(() => store.create(owner.id, "extra")).toThrow("上限");
  });

  it("发布含本地资源路径的内容返回 4xx 并透传原因，而非 500 兜底", async () => {
    const { app, store } = await setup();
    const owner = store.register("作者");
    const created = store.create(owner.id, "local-path");
    const doc = createSharedDocument({
      title: "本地资源",
      content: [{ type: "paragraph", children: [{ text: "正文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    doc.getMap("meta").set("bannerBg", "file:///etc/passwd");
    const response = await app.inject({
      method: "POST",
      url: `/v1/documents/${created.id}/publish`,
      headers: auth(owner),
      payload: { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_CONTENT",
      message: expect.stringContaining("本地路径"),
    });
    doc.destroy();
  });
});
