// @vitest-environment node
import { cleanup, host, resetAfterEach } from "./manager-node-document.mocks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createEditor, Transforms } from "slate";
import { WebSocket } from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  type ContentNode,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { withNodeTree } from "@tau/editor-collab";
import ContentTable from "../../tables/content";
import CardTable from "../../tables/card";
import ArticleTable from "../../tables/article";
import ProjectTable from "../../tables/project";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentDocumentBlocks } from "../../tables/content-document-blocks";
import { ContentIdentityTable } from "../../tables/content-identity";
import type { RuntimeSession } from "../types";
import { unregisterContentSession } from "../content-sessions";
import { collaborationImageStorage } from "../../../services/collaboration-image-storage";
import { TaskAssistantEngine, readTask } from "../../task-assistant/engine";
import { setup } from "./manager-node-document.helpers";
import { must } from "../../../test-support";

afterEach(resetAfterEach);

describe("桌面编辑投影与资产保全", () => {
  it("并发保存调用等待同一在途提交，不能在正文落库前返回完成", async () => {
    const { local, localSessions, localAssets, db, localId } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    await local.project(session);
    const tree = new NodeTree(session.doc);
    const localize = localAssets.localizeDocument.bind(localAssets);
    let release!: () => void;
    const paused = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.spyOn(localAssets, "localizeDocument").mockImplementationOnce(async (...args) => {
      await paused;
      return localize(...args);
    });
    try {
      tree.insertText("paragraph", 0, "等待", {});
      const first = local.project(session);
      let finished = false;
      const second = local.project(session).then(() => {
        finished = true;
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(finished).toBe(false);
      release();
      await Promise.all([first, second]);
      expect(
        must(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content[0]
            .children,
          "ContentDocumentTable.read(db, 7)!.content[0]...."
        )[0].text
      ).toBe("等待正文");
      expect(session.projectionDirty).toBe(false);
    } finally {
      release();
      tree.dispose();
    }
  });

  it("缓存增量写入失败后保留变更代次，未达压缩阈值也先补存再投影", async () => {
    const { local, localSessions, db, localId, localStore: store } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    await local.project(session);
    const tree = new NodeTree(session.doc);
    const append = vi.spyOn(store, "append").mockImplementationOnce(() => {
      throw new Error("模拟缓存写入失败");
    });
    try {
      expect(() => tree.insertText("paragraph", 0, "保留", {})).toThrow("模拟缓存写入失败");
      expect(session.cacheWriteFailed).toBe(true);
      expect(session.projectionVersion).not.toEqual(session.projectedVersion);
      append.mockRestore();
      const compact = vi.spyOn(store, "compact");
      await local.project(session);
      expect(compact).toHaveBeenCalledOnce();
      expect(session.cacheWriteFailed).toBe(false);
      expect(
        must(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content[0]
            .children,
          "ContentDocumentTable.read(db, 7)!.content[0]...."
        )[0].text
      ).toBe("保留正文");
      const recovered = store.load(localId);
      try {
        expect(
          must(
            readNodeDocument(recovered.doc).content[0].children,
            "readNodeDocument(recovered.doc).content[0].ch..."
          )[0].text
        ).toBe("保留正文");
      } finally {
        recovered.doc.destroy();
      }
    } finally {
      tree.dispose();
    }
  });

  it("拆分、合并后的共享文字片段按可见归属块保存，撤销重做不漏字", async () => {
    const { local, localSessions, db, localId } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    await local.project(session);
    const tree = new NodeTree(session.doc);
    const editor = withNodeTree(createEditor(), tree, {}, { normalizeOnConnect: false });
    try {
      editor.connectNodeTree();
      Transforms.select(editor, { path: [0, 0], offset: 1 });
      Transforms.splitNodes(editor, { always: true });
      editor.undoManager.stopCapturing();
      await local.project(session);
      Transforms.select(editor, { path: [1, 0], offset: 0 });
      Transforms.insertText(editor, "后半");
      editor.undoManager.stopCapturing();
      await local.project(session);
      const texts = () =>
        must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content.map(
          node =>
            must(node.children, "node.children")
              .map(child => child.text)
              .join("")
        );
      expect(texts()).toEqual(["正", "后半文"]);
      editor.undoManager.undo();
      await local.project(session);
      expect(texts()).toEqual(["正", "文"]);
      editor.undoManager.redo();
      await local.project(session);
      expect(texts()).toEqual(["正", "后半文"]);
      Transforms.mergeNodes(editor, { at: [1] });
      await local.project(session);
      expect(texts()).toEqual(["正后半文"]);
      Transforms.insertText(editor, "合并", { at: { path: [0, 0], offset: 1 } });
      await local.project(session);
      expect(texts()).toEqual(["正合并后半文"]);
    } finally {
      editor.disposeNodeTree();
      tree.dispose();
    }
  });

  it("打开、选区移动和补充契约不计编辑，实际修改正文才更新时间", async () => {
    const { local, localSessions, localAssets, db, localId } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    const before = must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)");
    db.prepare("UPDATE contents SET update_time=100 WHERE id=7").run();
    db.exec(`
      INSERT INTO cards(id,create_time,update_time,content_id) VALUES (1,1,50,7);
      INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
      INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
    `);
    const updateTimes = () => [
      must(ContentTable.getContentById(db, 7), "ContentTable.getContentById(db, 7)").updateTime,
      must(CardTable.getCardById(db, 1), "CardTable.getCardById(db, 1)").update_time,
      ArticleTable.getArticleById(db, 1).update_time,
      must(ProjectTable.getProjectItem(db, 1), "ProjectTable.getProjectItem(db, 1)").updateTime,
    ];
    const operationCount = () =>
      db.prepare("SELECT * FROM operation WHERE operation_content_type='content'").all().length;
    const initialOperations = operationCount();
    const tree = new NodeTree(session.doc);
    const editor = withNodeTree(createEditor(), tree, {}, { normalizeOnConnect: false });
    try {
      editor.connectNodeTree();
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      Transforms.move(editor, { distance: 1 });
      await local.project(session);
      expect(ContentDocumentTable.read(db, 7)).toEqual(before);
      expect(updateTimes()).toEqual([100, 100, 100, 100]);
      expect(operationCount()).toBe(initialOperations);

      const read = vi.spyOn(ContentDocumentTable, "read");
      const localize = vi.spyOn(localAssets, "localizeDocument");
      tree.setProperties("paragraph", { isFold: true, svg: "用户业务内容" }, {});
      await local.project(session);
      expect(read).not.toHaveBeenCalled();
      expect(localize).not.toHaveBeenCalled();
      read.mockRestore();

      const extra = await prepareContentContract("tau.heading", {
        type: "header",
        dataVersion: 1,
        kind: "block",
      });
      await tree.installContracts({ [extra.id]: extra.contract }, {});
      await local.project(session);
      const prepared = must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)");
      expect(prepared.contracts[extra.id]).toEqual(extra.contract);
      expect(updateTimes()).toEqual([100, 100, 100, 100]);
      expect(operationCount()).toBe(initialOperations);
      expect(prepared.content).toEqual(before.content);
      expect(localize).not.toHaveBeenCalled();

      Transforms.insertText(editor, "修改");
      await local.project(session);
      for (const time of updateTimes()) expect(time).toBeGreaterThan(100);
      expect(operationCount()).toBe(initialOperations + 1);
      expect(
        JSON.stringify(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content
        )
      ).toContain("正修改文");
      expect(session.projectedVersion).toEqual(session.projectionVersion);
    } finally {
      editor.disposeNodeTree();
      tree.dispose();
    }
  });

  it("只改标题不读取或转换正文，正常更新文章和项目标题", async () => {
    const { local, localSessions, localAssets, db, localId } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    await local.project(session);
    db.exec(`
      INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
      INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
    `);
    const before = must(
      ContentTable.getContentById(db, 7),
      "ContentTable.getContentById(db, 7)"
    ).updateTime;
    const read = vi.spyOn(ContentDocumentTable, "read");
    const localize = vi.spyOn(localAssets, "localizeDocument");
    session.doc.getText("title").insert(0, "修改标题");
    await local.project(session);
    expect(read).not.toHaveBeenCalled();
    expect(localize).not.toHaveBeenCalled();
    expect(ArticleTable.getArticleById(db, 1).title).toBe("修改标题");
    expect(
      must(ProjectTable.getProjectItem(db, 1), "ProjectTable.getProjectItem(db, 1)").title
    ).toBe("修改标题");
    expect(
      must(ContentTable.getContentById(db, 7), "ContentTable.getContentById(db, 7)").updateTime
    ).toBe(before);
  });

  it("投影期间的新输入与落库失败不会被当成本轮已保存", async () => {
    const { local, localSessions, localAssets, db, localId } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    await local.project(session);
    const tree = new NodeTree(session.doc);
    const localize = localAssets.localizeDocument.bind(localAssets);
    try {
      tree.insertText("paragraph", 0, "先", {});
      vi.spyOn(localAssets, "localizeDocument").mockImplementationOnce(async (...args) => {
        const value = await localize(...args);
        tree.insertText("paragraph", 0, "后", {});
        return value;
      });
      await local.project(session);
      expect(
        JSON.stringify(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content
        )
      ).toContain("先正文");
      expect(session.projectedVersion).not.toEqual(session.projectionVersion);
      expect(session.projectionDirty).toBe(true);
      await local.project(session);
      expect(
        JSON.stringify(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content
        )
      ).toContain("后先正文");
      expect(session.projectedVersion).toEqual(session.projectionVersion);

      tree.insertText("paragraph", 0, "重试", {});
      vi.spyOn(ContentDocumentBlocks, "commit").mockImplementationOnce(() => {
        throw new Error("模拟落库失败");
      });
      await expect(local.project(session)).rejects.toThrow("模拟落库失败");
      expect(session.projectedVersion).not.toEqual(session.projectionVersion);
      expect(session.projectionDirty).toBe(true);
      await local.project(session);
      expect(
        JSON.stringify(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content
        )
      ).toContain("重试后先正文");
      expect(session.projectedVersion).toEqual(session.projectionVersion);
    } finally {
      tree.dispose();
    }
  });

  it.each([false, true])(
    "作者离线期间的成员图片在上线后自动补存，无需打开正文（冷缓存=%s）",
    async cold => {
      const { runtime, event, db, server, owner, store } = await setup(true);
      const url = host.serverUrl;
      const shared = await runtime.createContent(event, 7);
      let session = must(
        runtime.content.sessions.get(shared.documentId),
        "runtime.content.sessions.get(shared.documentId)"
      );
      await vi.waitFor(() => expect(session.provider?.synced).toBe(true), { timeout: 5000 });
      runtime.content.startAutoFlush();
      await vi.waitFor(() => expect(session.projectionDirty).toBe(false), { timeout: 3000 });
      const save = vi
        .spyOn(collaborationImageStorage, "save")
        .mockRejectedValue(new Error("作者存储宿主尚未就绪"));
      must(session.provider, "session.provider").detach();
      for (const transport of runtime.transports.values()) transport.disconnect();
      store.compact(shared.documentId, session.doc);
      if (cold) {
        must(session.provider, "session.provider").destroy();
        unregisterContentSession(session);
        session.awareness.destroy();
        session.doc.destroy();
        runtime.content.sessions.delete(shared.documentId);
        for (const transport of runtime.transports.values()) transport.destroy();
        runtime.transports.clear();
      }

      const member = server.store.register("离线期间的成员");
      const request = server.store.requestJoin(
        server.store.rotateCode(shared.documentId, owner.id).code,
        member.id
      );
      if (request.status !== "pending") throw new Error("未创建成员申请");
      server.store.decide(request.id, owner.id, true);
      const memberDoc = new Y.Doc({ gc: false });
      const memberSocket = new HocuspocusProviderWebsocket({
        url: url.replace(/^http/, "ws") + "/ws",
        WebSocketPolyfill: WebSocket,
      });
      const memberProvider = new HocuspocusProvider({
        name: shared.documentId,
        document: memberDoc,
        websocketProvider: memberSocket,
        token: () => server.store.ticket(member.id, shared.documentId, 2),
      });
      cleanup.push(() => {
        memberProvider.destroy();
        memberSocket.destroy();
        memberDoc.destroy();
      });
      memberProvider.attach();
      await vi.waitFor(() => expect(memberProvider.synced).toBe(true), { timeout: 5000 });
      const bytes = new TextEncoder().encode("IMAGE_UPLOADED_WHILE_OWNER_OFFLINE");
      const assetId = crypto.randomUUID();
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "image/png" }), "offline-member.png");
      const uploaded = await fetch(`${url}/v1/documents/${shared.documentId}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${member.id}:${member.secret}`, "X-Asset-Id": assetId },
        body: form,
      });
      expect(uploaded.ok).toBe(true);
      const reference = `tau-collab-asset:${assetId}`;
      const image = await prepareContentContract("tau.image", {
        type: "image",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        resources: [{ path: "url", kind: "image" }],
      });
      const tree = new NodeTree(memberDoc);
      try {
        await tree.installContracts({ [image.id]: image.contract }, null);
        tree.insertNode(
          {
            type: "image",
            collabId: "offline-image",
            tauContract: image.id,
            url: reference,
            children: [{ text: "" }],
          },
          null,
          1,
          null,
          true
        );
        await vi.waitFor(
          () => {
            const remote = server.store.loadDocument(shared.documentId);
            try {
              expect(readNodeDocument(remote).content[1]).toMatchObject({ url: reference });
            } finally {
              remote.destroy();
            }
          },
          { timeout: 5000 }
        );
      } finally {
        tree.dispose();
      }
      expect(save).not.toHaveBeenCalled();
      expect(
        must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content
      ).toHaveLength(1);

      if (cold) {
        const attach = vi.spyOn(runtime, "attach").mockImplementation(() => {});
        const { documents } = await runtime.client.request<{ documents: SharedDocumentInfo[] }>(
          url,
          "/v1/documents"
        );
        await runtime.syncRemoteDocument(
          url,
          must(
            documents.find(info => info.id === shared.documentId),
            "documents.find(info => info.id === shared.doc..."
          )
        );
        session = must(
          runtime.content.sessions.get(shared.documentId),
          "runtime.content.sessions.get(shared.documentId)"
        );
        await vi.waitFor(() => expect(session.projectionDirty).toBe(false), { timeout: 3000 });
        expect(readNodeDocument(session.doc).content).toHaveLength(1);
        attach.mockRestore();
        host.databases.delete("library");
        runtime.attach(session);
      } else {
        must(session.provider, "session.provider").attach();
        for (const transport of runtime.transports.values()) await transport.connect();
      }
      await vi.waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 5000 });
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ mime: "image/png", bytes }));
      await vi.waitFor(() => expect(session.info.error).toContain("作者存储宿主尚未就绪"));
      expect(session.projectionDirty).toBe(true);
      mkdirSync(join(host.dir, "resources"), { recursive: true });
      const owned = cold
        ? "https://owner.test/after-restart.webp"
        : join(host.dir, "resources", "after-reconnect.webp");
      if (!cold) writeFileSync(owned, "OWNER_COMPRESSED_IMAGE");
      save.mockResolvedValue(owned);
      await vi.waitFor(
        () => expect(runtime.assets.ownerImageReference(shared.documentId, reference)).toBe(owned),
        { timeout: 5000 }
      );
      if (cold) {
        expect(
          must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content
        ).toHaveLength(1);
        host.databases.set("library", db);
      }
      await vi.waitFor(
        () =>
          expect(
            must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content[1]
          ).toMatchObject({ url: owned }),
        { timeout: 5000 }
      );
      expect(session.info.error).toBeUndefined();
      expect(runtime.content.views.size).toBe(0);
      expect(server.store.document(shared.documentId).status).toBe("active");
    },
    20_000
  );

  it("远端图片先按作者配置保存，失败不关闭共享，成功后本机正文使用作者图床地址", async () => {
    const { runtime, local, event, db, server, owner } = await setup();
    const shared = await runtime.createContent(event, 7);
    const session = must(
      runtime.content.sessions.get(shared.documentId),
      "runtime.content.sessions.get(shared.documentId)"
    );
    session.provider = {
      attach: vi.fn(),
      detach: vi.fn(),
      destroy: vi.fn(),
    } as unknown as RuntimeSession["provider"];
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const assetId = crypto.randomUUID();
    const bytes = Buffer.from("REMOTE_MEMBER_IMAGE");
    const hash = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(host.dir, "server", "assets", hash), bytes);
    server.store.insertAsset(
      shared.documentId,
      assetId,
      hash,
      "member.png",
      "image/png",
      bytes.length
    );
    const remote = server.store.loadDocument(shared.documentId);
    const fork = new Y.Doc({ gc: false });
    Y.applyUpdate(fork, Y.encodeStateAsUpdate(remote));
    const vector = Y.encodeStateVector(fork);
    const tree = new NodeTree(fork);
    try {
      await tree.installContracts({ [image.id]: image.contract }, null);
      tree.insertNode(
        {
          type: "image",
          collabId: "member-image",
          tauContract: image.id,
          url: `tau-collab-asset:${assetId}`,
          children: [{ text: "" }],
        },
        null,
        1,
        null,
        true
      );
      await server.store.appendUpdate(
        shared.documentId,
        owner.id,
        Y.encodeStateAsUpdate(fork, vector),
        remote
      );
    } finally {
      tree.dispose();
      fork.destroy();
      remote.destroy();
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const result = await server.app.inject({
          method: "GET",
          url: new URL(url).pathname,
          headers: init.headers as Record<string, string>,
        });
        return new Response(new Uint8Array(result.rawPayload), {
          status: result.statusCode,
          headers: {
            "content-type": String(result.headers["content-type"]),
            "content-disposition": String(result.headers["content-disposition"]),
          },
        });
      })
    );
    const save = vi
      .spyOn(collaborationImageStorage, "save")
      .mockRejectedValue(new Error("作者图床连接失败"));
    await expect(runtime.prepareLeave(session)).rejects.toThrow("作者图床连接失败");
    expect(session.info.frozen).toBe(false);
    expect(server.store.document(shared.documentId).status).toBe("active");
    const owned = "https://owner.test/compressed.webp";
    save.mockResolvedValue(owned);
    await runtime.prepareLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("active");
    expect(
      must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)").content[1]
    ).toMatchObject({ url: owned });
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ mime: "image/png", bytes: new Uint8Array(bytes) })
    );
    expect(
      must(await ContentTable.readContent(db, 7), "(await ContentTable.readContent(db, 7))")
        .content[1]
    ).toMatchObject({ url: owned });
    session.info.leaving = true;
    await runtime.finishLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("closed");
    expect(
      must(await ContentTable.readContent(db, 7), "(await ContentTable.readContent(db, 7))")
        .content[1]
    ).toMatchObject({ url: owned });
    expect((await local.open(event, { contentId: 7 })).mode).toBe("local");
    expect(
      must(await ContentTable.readContent(db, 7), "(await ContentTable.readContent(db, 7))")
        .content[1]
    ).toMatchObject({ url: owned });
  });

  it("本机图片保存保留路径和图床 URL，存量编号转存后缓存重建仍能读取", async () => {
    const {
      local,
      localSessions,
      localAssets,
      localId,
      event,
      db,
      localStore: store,
    } = await setup();
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [
        { path: "url", kind: "image" },
        { path: "previewUrl", kind: "image" },
      ],
    });
    const legacy = await localAssets.keepLocalFile(localId, {
      name: "legacy.png",
      mime: "image/png",
      bytes: new TextEncoder().encode("LEGACY_IMAGE"),
    });
    const localImage = "~/.editor/resources/new.webp";
    const remote = "https://images.test/compressed.webp";
    const before = must(
      await ContentTable.readContent(db, 7),
      "(await ContentTable.readContent(db, 7))"
    );
    await ContentTable.writeContent(db, 7, {
      expectedRevision: before.revision,
      contracts: { ...before.contracts, [image.id]: image.contract },
      content: [
        ...before.content,
        ...[legacy, localImage, remote].map((url, index) => ({
          type: "image",
          collabId: `image-${index}`,
          tauContract: image.id,
          url,
          previewUrl: url,
          children: [{ text: "" }],
        })),
      ] as never,
    });
    const saved = must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)");
    const path = String(saved.content[1].url);
    expect(path).toContain(join("resources", "collaboration"));
    expect(readFileSync(path, "utf8")).toBe("LEGACY_IMAGE");
    expect(saved.content[1].previewUrl).toBe(path);
    expect(saved.content.slice(2).map(node => node.url)).toEqual([localImage, remote]);
    expect(
      readNodeDocument(must(localSessions.get(localId), "localSessions.get(localId)").doc).content
    ).toEqual(saved.content);

    const session = must(localSessions.get(localId), "localSessions.get(localId)");
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    localSessions.delete(localId);
    store.discard(localId, "验证按主库重建本机会话");
    await local.open(event, { contentId: 7 });
    expect(
      readNodeDocument(must(localSessions.get(localId), "localSessions.get(localId)").doc).content
    ).toEqual(saved.content);
    expect(readFileSync(path, "utf8")).toBe("LEGACY_IMAGE");
  });

  it.each([false, true])("附件仅在其他设备上时仍能打开、编辑和保存（共享=%s）", async shared => {
    const { runtime, local, localSessions, localId, event, db } = await setup();
    let session = must(localSessions.get(localId), "localSessions.get(localId)");
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const reference = `tau-collab-local:${crypto.randomUUID()}`;
    const tree = new NodeTree(session.doc);
    await tree.installContracts({ [image.id]: image.contract }, null);
    tree.insertNode(
      {
        type: "image",
        collabId: "missing-image",
        tauContract: image.id,
        url: reference,
        children: [{ text: "" }],
      },
      null,
      1,
      null,
      true
    );
    tree.dispose();
    await local.project(session);
    if (shared)
      session = must(
        runtime.content.sessions.get((await runtime.createContent(event, 7)).documentId),
        "runtime.content.sessions.get((await runtime.c..."
      );

    await expect(local.open(event, { contentId: 7 })).resolves.toMatchObject({
      documentId: session.info.id,
      frozen: false,
    });
    const before = must(
      await ContentTable.readContent(db, 7),
      "(await ContentTable.readContent(db, 7))"
    );
    expect(before.content[1]).toMatchObject({ url: reference });
    const content = structuredClone(before.content) as ContentNode[];
    content[0].children = [{ text: "附件不可用时仍可编辑" }];
    await ContentTable.writeContent(db, 7, {
      content: content as never,
      contracts: before.contracts,
      expectedRevision: before.revision,
    });
    const saved = must(ContentDocumentTable.read(db, 7), "ContentDocumentTable.read(db, 7)");
    expect(saved.content[0].children).toMatchObject([{ text: "附件不可用时仍可编辑" }]);
    expect(saved.content[1]).toMatchObject({ collabId: "missing-image", url: reference });
    expect(readNodeDocument(session.doc).content[1]).toMatchObject({ url: reference });
    await expect(local.open(event, { contentId: 7 })).resolves.toMatchObject({
      frozen: false,
    });
  });

  it("替换引用后旧实体仍由撤销持有保护，撤销只恢复一次同步引用数", async () => {
    const { local, localSessions, db, localState: state, localId } = await setup();
    for (const id of [41, 42])
      db.prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES (?,1,1,'{}',0)"
      ).run(id);
    const first = ContentIdentityTable.reference(db, "whiteboard-content", 41),
      second = ContentIdentityTable.reference(db, "whiteboard-content", 42);
    const session = must(localSessions.get(localId), "localSessions.get(localId)"),
      tree = new NodeTree(session.doc),
      origin = {};
    const definition = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    await tree.installContracts({ [definition.id]: definition.contract }, null);
    tree.insertNode(
      {
        type: "whiteboard",
        collabId: "board",
        tauContract: definition.id,
        entityRef: first,
        children: [{ text: "" }],
      },
      null,
      1,
      null,
      true
    );
    await local.project(session);
    const history = tree.createUndoManager({ trackedOrigins: new Set([origin]) });
    try {
      tree.setProperties("board", { entityRef: second }, origin);
      await local.project(session);
      expect(state.isHeld("library", first)).toBe(true);
      expect(state.isHeld("library", second)).toBe(true);
      expect(db.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()).toEqual(
        [
          { id: 41, ref_count: 0 },
          { id: 42, ref_count: 1 },
        ]
      );
      history.undo();
      await local.project(session);
      expect(db.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()).toEqual(
        [
          { id: 41, ref_count: 1 },
          { id: 42, ref_count: 0 },
        ]
      );
    } finally {
      history.destroy();
      tree.dispose();
    }
  });

  for (const shared of [false, true])
    it(`${shared ? "共享" : "本机"}快照写入复用稳定节点和源码字段，旧修订不会覆盖新正文`, async () => {
      const {
        runtime,
        local,
        localSessions,
        localState,
        localId,
        event,
        db,
        server,
        owner,
        state,
      } = await setup();
      let session = must(localSessions.get(localId), "localSessions.get(localId)");
      const declaration = await prepareContentContract("example", {
        type: "example.source",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        collaboration: { textFields: ["source"] },
      });
      const tree = new NodeTree(session.doc);
      await tree.installContracts({ [declaration.id]: declaration.contract }, null);
      tree.insertNode(
        {
          type: "example.source",
          collabId: "source",
          tauContract: declaration.id,
          source: "初始源码",
          children: [{ text: "" }],
        },
        null,
        1,
        null,
        true
      );
      tree.dispose();
      await local.project(session);
      if (shared)
        session = must(
          runtime.content.sessions.get((await runtime.createContent(event, 7)).documentId),
          "runtime.content.sessions.get((await runtime.c..."
        );
      const before = must(ContentTable.getContentById(db, 7), "ContentTable.getContentById(db, 7)");
      const content = structuredClone(before.content) as ContentNode[];
      content[1].source = "修改源码";
      await ContentTable.writeContent(db, 7, {
        content: content as never,
        contracts: before.contracts,
        expectedRevision: before.revision,
      });
      expect(readNodeDocument(session.doc).content[1]).toMatchObject({
        collabId: "source",
        source: "修改源码",
      });
      await validateNodeDocument(session.doc);
      expect((shared ? state : localState).documentDrafts("library")).toHaveLength(0);
      await expect(
        ContentTable.writeContent(db, 7, {
          content: before.content,
          expectedRevision: before.revision,
        })
      ).rejects.toThrow("VERSION_CONFLICT");
      if (shared) {
        const remote = server.store.loadDocument(session.info.id),
          fork = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(fork, Y.encodeStateAsUpdate(remote));
          const vector = Y.encodeStateVector(fork),
            peer = new NodeTree(fork);
          peer.textField("source", "source").insert(0, "远端");
          await server.store.appendUpdate(
            session.info.id,
            owner.id,
            Y.encodeStateAsUpdate(fork, vector),
            remote
          );
          const latest = must(
            ContentTable.getContentById(db, 7),
            "ContentTable.getContentById(db, 7)"
          );
          await expect(
            ContentTable.writeContent(db, 7, {
              content: before.content,
              contracts: latest.contracts,
              expectedRevision: latest.revision,
            })
          ).rejects.toThrow("VERSION_CONFLICT");
          expect((shared ? state : localState).documentDrafts("library")).toHaveLength(1);
          expect(new NodeTree(remote).textField("source", "source").toString()).toContain("远端");
          peer.dispose();
        } finally {
          remote.destroy();
          fork.destroy();
        }
      }
    });

  it("正文助理复用稳定节点操作，回执保存在本机缓存，不污染共享文档根", async () => {
    const { local, localSessions, localId, db, localStore: store } = await setup();
    const session = must(localSessions.get(localId), "localSessions.get(localId)"),
      tree = new NodeTree(session.doc);
    const list = await prepareContentContract("tau.check-list", {
      type: "check-list",
      dataVersion: 1,
      kind: "block",
    });
    const item = await prepareContentContract("tau.check-list-item", {
      type: "check-list-item",
      dataVersion: 1,
      kind: "block",
    });
    const paragraph = must(
      Object.entries(tree.contracts.toJSON()).find(
        ([, value]) => (value as { type: string }).type === "paragraph"
      ),
      "paragraph contract"
    )[0];
    await tree.installContracts({ [list.id]: list.contract, [item.id]: item.contract }, null);
    tree.insertNode(
      {
        type: "check-list",
        tauContract: list.id,
        collabId: "tasks",
        children: [
          {
            type: "check-list-item",
            tauContract: item.id,
            collabId: "item",
            taskId: "task",
            checked: false,
            children: [
              {
                type: "paragraph",
                tauContract: paragraph,
                collabId: "task-title",
                children: [{ text: "原任务" }],
              },
            ],
          },
        ],
      },
      null,
      1,
      null,
      true
    );
    await local.project(session);
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES ('正文',7,1,1)"
    ).run();
    const ref = { kind: "document" as const, contentId: 7, createdAt: 1, taskId: "task" };
    const before = readTask(db, ref);
    const result = new TaskAssistantEngine(db).execute(
      "update_todo",
      {
        requestId: "stable-task",
        taskRef: ref,
        revision: before.revision,
        patch: { title: "修改后的任务" },
      },
      "batch"
    );
    expect(result.status, JSON.stringify(result)).toBe("succeeded");
    expect(readTask(db, ref).title).toBe("修改后的任务");
    expect(tree.nodeSnapshot("task-title").children?.[0].text).toBe("修改后的任务");
    expect(session.doc.share.has("task-operation-receipts")).toBe(false);
    expect(store.get(`task-receipt:${localId}:${result.operationId}`, null)).not.toBeNull();
    await validateNodeDocument(session.doc);
    tree.dispose();
  });
});
