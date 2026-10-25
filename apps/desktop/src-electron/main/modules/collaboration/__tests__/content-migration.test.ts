import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
// @vitest-environment node
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readNodeDocument,
  readSharedContent as importedReadSharedContent,
  NodeTree,
  ASSET_PREFIX,
  collectSharedResources,
  validateDocument,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import { ContentLocalState } from "../content-local-state";
import { ContentRecoveryStore } from "../content-recovery";
import { CollaborationLocalStore } from "../local-store";
import { CollaborationAssetService } from "../asset-service";
import { ContentMigration } from "../content-migration";
import type { RuntimeSession } from "../types";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run());
});
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-content-upgrade-"));
  const db = new Database(join(directory, "library.db"));
  db.exec(schema);
  const cache = new CollaborationLocalStore(directory),
    state = new ContentLocalState(cache.db),
    recovery = new ContentRecoveryStore(directory, state);
  const assets = new CollaborationAssetService(cache, directory, async () => {
    throw new Error("本机转换不能使用网络");
  });
  const service = new ContentMigration(state, cache, assets, recovery);
  const content = [
    { type: "code-block", code: "const 原文 = 1", isFold: true, children: [{ text: "" }] },
    { type: "whiteboard", whiteBoardContentId: 42, children: [{ text: "" }] },
  ];
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (7,100,100,?,0,1)"
  ).run(JSON.stringify(content));
  db.prepare(
    "INSERT INTO white_board_contents(id,create_time,update_time,data,name,ref_count) VALUES (42,1,1,'{}','原白板',1)"
  ).run();
  const doc = createSharedDocument(
    { title: "旧正文", content, bannerBg: "", bannerPosition: "center" },
    undefined,
    "local"
  );
  const session = {
    doc,
    info: {
      id: "local-document",
      mode: "local",
      title: "旧正文",
      frozen: true,
      source: { databaseName: "library", contentId: 7, contentCreatedAt: 100 },
      status: "active",
      role: "owner",
      serverUrl: "",
      ownerId: "local",
      members: [],
      updatedAt: 100,
      connection: "connected",
      pending: false,
      leaving: false,
    },
  } as unknown as RuntimeSession;
  cache.create(session.info, doc);
  const definitions = await Promise.all([
    prepareContentContract("tau.code-block", {
      type: "code-block",
      dataVersion: 2,
      kind: "block",
      isVoid: true,
    }),
    prepareContentContract("tau.code-block", {
      type: "code-step",
      dataVersion: 1,
      kind: "block",
      collaboration: { textFields: ["code"] },
    }),
    prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    }),
  ]);
  const contracts = Object.fromEntries(definitions.map(entry => [entry.id, entry.contract]));
  cleanup.push(() => {
    doc.destroy();
    db.close();
    cache.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { db, state, cache, recovery, service, session, contracts, assets };
}

describe("本机正文升级的三个存储安装", () => {
  it("单篇转换仅保全目标投影、草稿、视图和依赖，不携带整库或其他文档", async () => {
    const { db, state, service, session, contracts, recovery } = await setup();
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (999,2,2,?,0,1)"
    ).run(
      JSON.stringify([{ type: "image", url: "/不相关附件.png", children: [{ text: "其他正文" }] }])
    );
    ContentIdentityTable.establishBaseline(db);
    state.replaceHolds("library", "document:other", "recovery", [
      ContentIdentityTable.reference(db, "content", 999),
    ]);
    for (const documentId of [session.info.id, "other"]) {
      const identity = { workspaceId: "library", documentId, baselineId: "old", epoch: 0 };
      state.saveInputDraft(identity, documentId, {
        nodeId: "node",
        field: "code",
        value: documentId,
        revision: "r",
        sequence: 1,
      });
      state.saveDocumentDraft(identity, documentId, {
        state: Y.encodeStateAsUpdate(session.doc),
        sequence: 1,
      });
      state.writeView(
        { workspaceId: "library", documentId, nodeId: "node", owner: "tau.code-block" },
        { title: documentId },
        null
      );
    }
    const prepared = await service.prepare(db, session, contracts);
    const manifest = recovery.verify(prepared.plan.recovery);
    expect(manifest.files.some(file => file.name.endsWith(".db"))).toBe(false);
    const projection = JSON.parse(
      recovery.readFile(prepared.plan.recovery, "source-projection.json").toString()
    );
    expect(projection.source.contentId).toBe(7);
    expect(projection.content[0].code).toBe("const 原文 = 1");
    expect(
      JSON.parse(recovery.readFile(prepared.plan.recovery, "input-drafts.json").toString())
    ).toMatchObject([{ documentId: session.info.id }]);
    expect(
      JSON.parse(recovery.readFile(prepared.plan.recovery, "input-drafts.json").toString())
    ).toHaveLength(1);
    expect(
      JSON.parse(recovery.readFile(prepared.plan.recovery, "node-views.json").toString())
    ).toHaveLength(1);
    expect(manifest.files.filter(file => /^view-.*\.bin$/.test(file.name))).toHaveLength(1);
    expect(recovery.readFile(prepared.plan.recovery, "resources.json").toString()).not.toContain(
      "不相关附件"
    );
    expect(manifest.missing).not.toContain("/不相关附件.png");
    const installation = JSON.parse(
      recovery.readFile(prepared.plan.recovery, "installation.json").toString()
    );
    expect(
      installation.entities.some((entity: { local_id: number }) => entity.local_id === 999)
    ).toBe(false);
  });

  it.each([true, false])("未知旧插件附件按旧声明保全，下载成功=%s", async downloaded => {
    const { service, session, contracts, cache, recovery, assets } = await setup();
    const assetId = "11111111-1111-4111-8111-111111111111";
    const reference = ASSET_PREFIX + assetId;
    const content = [{ type: "unknown-plugin", image: reference, children: [{ text: "" }] }];
    const doc = createSharedDocument({
      title: "旧共享",
      content,
      bannerBg: "",
      bannerPosition: "center",
    });
    doc.getMap("resources").set("unknown-plugin", [{ path: "image", kind: "image" }]);
    validateDocument(doc);
    expect(collectSharedResources(doc)).toContain(reference);
    session.doc = doc;
    session.info.mode = "shared";
    session.info.source = undefined;
    cache.compact(session.info.id, doc);
    cleanup.push(() => doc.destroy());
    const resolve = vi.spyOn(assets, "resolve").mockImplementation(async (_url, documentId, id) => {
      if (!downloaded) throw new Error("附件不可达");
      const path = join(recovery.directory, "downloaded.png");
      writeFileSync(path, "旧插件附件");
      cache.db
        .prepare("INSERT INTO resources VALUES (?,?,?,?,?,?)")
        .run(id, documentId, "image.png", "image/png", path, 1);
      return path;
    });
    const prepared = await service.prepare(undefined, session, contracts, {
      workspaceId: "library",
      document: doc,
      operation: {
        id: "legacy-assets",
        documentId: session.info.id,
        actorId: "local",
        expectedEpoch: 0,
        expiresAt: Date.now() + 60_000,
        state: "PENDING",
        frozenRevision: createHash("sha256").update(Y.encodeStateAsUpdate(doc)).digest("hex"),
      },
    });
    expect(resolve).toHaveBeenCalledWith("", session.info.id, assetId);
    const manifest = recovery.verify(prepared.plan.recovery);
    const resources = JSON.parse(
      recovery.readFile(prepared.plan.recovery, "resources.json").toString()
    );
    expect(resources).toHaveLength(1);
    expect(resources[0].reference).toBe(reference);
    if (downloaded) {
      expect(manifest.missing).toEqual([]);
      expect(recovery.readFile(prepared.plan.recovery, resources[0].file).toString()).toBe(
        "旧插件附件"
      );
    } else {
      expect(manifest.missing).toEqual([reference]);
      expect(resources[0].file).toBeUndefined();
    }
    const installation = JSON.parse(
      recovery.readFile(prepared.plan.recovery, "installation.json").toString()
    );
    expect(installation.document.content[0].original.image).toBe(reference);
  });

  it("折叠区的原引用转换和重试不重复计数，删除后归零", async () => {
    const { db, service, session, contracts, cache } = await setup();
    const paragraph = { type: "paragraph", children: [{ text: "当前首段" }] };
    const content = [
      {
        type: "list-item",
        isFold: true,
        children: [paragraph],
        allContent: [
          paragraph,
          { type: "whiteboard", whiteBoardContentId: 42, children: [{ text: "" }] },
        ],
      },
    ];
    db.prepare("UPDATE contents SET content=? WHERE id=7").run(JSON.stringify(content));
    const doc = createSharedDocument(
      { title: "旧正文", content, bannerBg: "", bannerPosition: "center" },
      undefined,
      "local"
    );
    session.doc = doc;
    cache.compact(session.info.id, doc);
    cleanup.push(() => doc.destroy());
    for (const type of ["paragraph", "list-item"]) {
      const item = await prepareContentContract(`tau.${type}`, {
        type,
        dataVersion: 1,
        kind: "block",
      });
      contracts[item.id] = item.contract;
    }
    const prepared = await service.prepare(db, session, contracts);
    for (let attempt = 0; attempt < 2; attempt++) {
      const installed = await service.install(db, prepared.plan.operationId);
      installed.destroy();
      expect(db.prepare("SELECT ref_count FROM white_board_contents WHERE id=42").get()).toEqual({
        ref_count: 1,
      });
    }
    const stored = ContentDocumentTable.read(db, 7)!;
    expect(stored.content[0].children).toHaveLength(2);
    ContentDocumentTable.commit(
      db,
      7,
      { ...stored, content: [] },
      { expectedRevision: stored.revision, count: 0 }
    );
    expect(db.prepare("SELECT ref_count FROM white_board_contents WHERE id=42").get()).toEqual({
      ref_count: 0,
    });
  });

  it("引用实体中的文件进入恢复包，损坏和缺失资源不能假称已保全", async () => {
    const { db, service, session, contracts, recovery } = await setup();
    const image = join(recovery.directory, "original.png"),
      missing = join(recovery.directory, "missing.png");
    writeFileSync(image, "原图片字节");
    db.prepare("UPDATE white_board_contents SET data=? WHERE id=42").run(
      JSON.stringify({
        children: [
          { type: "image", src: image },
          { type: "image", src: missing },
        ],
      })
    );
    const prepared = await service.prepare(db, session, contracts);
    const manifest = recovery.verify(prepared.plan.recovery);
    const resources = JSON.parse(
      recovery.readFile(prepared.plan.recovery, "resources.json").toString()
    ) as { reference: string; file?: string }[];
    const saved = resources.find(resource => resource.reference === image)!;
    expect(saved.file).toBeDefined();
    expect(recovery.readFile(prepared.plan.recovery, saved.file!).toString()).toBe("原图片字节");
    expect(manifest.missing).toContain(missing);
  });
  it("过期落不可复活终态，取消也不改写过期裁决", async () => {
    const { db, state, service, session, contracts } = await setup();
    const prepared = await service.prepare(db, session, contracts);
    vi.spyOn(Date, "now").mockReturnValue(prepared.plan.expiresAt! + 1);
    await expect(service.install(db, prepared.plan.operationId)).rejects.toThrow("已终止");
    expect(state.migration(prepared.plan.operationId)?.phase).toBe("EXPIRED");
    expect(state.decideLocal(prepared.plan.operationId, "abort").phase).toBe("EXPIRED");
    expect(ContentDocumentTable.read(db, 7)).toBeNull();
  });
  for (const boundary of ["decision", "main", "collaboration"] as const)
    it(`${boundary} 中断后按原操作续做，引用不重复记账且恢复包仍可读`, async () => {
      const { db, state, cache, recovery, service, session, contracts } = await setup();
      const prepared = await service.prepare(db, session, contracts);
      expect(ContentIdentityTable.library(db)).toBeNull();
      await expect(
        service.install(db, prepared.plan.operationId, phase => {
          if (phase === boundary) throw new Error("模拟断电");
        })
      ).rejects.toThrow("模拟断电");
      expect(state.migration(prepared.plan.operationId)?.phase).not.toBe("COMPLETE");
      const installed = await service.install(db, prepared.plan.operationId);
      try {
        expect(readNodeDocument(installed).content[0]).toMatchObject({
          type: "code-block",
          children: [{ type: "code-step", code: "const 原文 = 1" }],
        });
        expect(ContentDocumentTable.read(db, 7)?.contracts).toEqual(
          installed.getMap("node-tree:contracts").toJSON()
        );
        expect(db.prepare("SELECT ref_count FROM white_board_contents WHERE id=42").get()).toEqual({
          ref_count: 1,
        });
        const cached = cache.load(session.info.id);
        try {
          expect(cache.legacyPrivateNodes(session.info.id).size).toBe(0);
        } finally {
          cached.doc.destroy();
        }
        expect(state.migration(prepared.plan.operationId)?.phase).toBe("COMPLETE");
        expect(state.db.prepare("SELECT value FROM node_views").get()).toMatchObject({
          value: expect.stringContaining('"isFold":true'),
        });
        const files = recovery.verify(prepared.plan.recovery).files.map(file => file.name);
        expect(files).toContain("source-projection.json");
        expect(files).not.toContain("main-before.db");
      } finally {
        installed.destroy();
      }
    });

  it("取消和准备后正文变化都不能覆盖原文", async () => {
    const { db, state, service, session, contracts } = await setup();
    const prepared = await service.prepare(db, session, contracts);
    state.decideLocal(prepared.plan.operationId, "abort");
    await expect(service.install(db, prepared.plan.operationId)).rejects.toThrow("已终止");
    const next = await service.prepare(db, session, contracts);
    db.prepare("UPDATE contents SET content='[]' WHERE id=7").run();
    await expect(service.install(db, next.plan.operationId)).rejects.toThrow("原正文已变化");
    expect(ContentDocumentTable.read(db, 7)).toBeNull();
    expect(ContentIdentityTable.library(db)).toBeNull();
  });

  it("成功后的迟到重试不恢复旧候选，不覆盖后来输入", async () => {
    const { db, cache, service, session, contracts } = await setup();
    const prepared = await service.prepare(db, session, contracts);
    const installed = await service.install(db, prepared.plan.operationId);
    const tree = new NodeTree(installed);
    try {
      const step = String(tree.read()[0].children![0].collabId);
      tree.textField(step, "code").insert(0, "后来输入\n");
      cache.compact(session.info.id, installed);
      const replay = await service.install(db, prepared.plan.operationId);
      try {
        expect(readNodeDocument(replay).content[0].children![0].code).toContain("后来输入");
      } finally {
        replay.destroy();
      }
    } finally {
      tree.dispose();
      installed.destroy();
    }
  });
});

describe("后台批量正文升级", () => {
  it("已有来源基线时不逐篇复制整库，转换不改变用户修改时间", async () => {
    const f = await setup();
    ContentIdentityTable.establishBaseline(f.db);
    const backup = vi.spyOn(f.db, "backup");
    const before = f.db.prepare("SELECT update_time FROM contents WHERE id=7").get();
    const prepared = await f.service.prepare(f.db, f.session, f.contracts);
    expect(backup).not.toHaveBeenCalled();
    const installed = await f.service.install(f.db, prepared.plan.operationId);
    installed.destroy();
    expect(f.db.prepare("SELECT update_time FROM contents WHERE id=7").get()).toEqual(before);
    expect(
      f.recovery
        .verify(prepared.plan.recovery)
        .files.some(file => file.name === "source-projection.json")
    ).toBe(true);
  });

  it("缺失的实体身份只进入候选，保全成功前不修改主库", async () => {
    const f = await setup();
    ContentIdentityTable.establishBaseline(f.db);
    f.db
      .prepare(
        "DELETE FROM entity_identities WHERE entity_kind='whiteboard-content' AND local_id=42"
      )
      .run();
    const prepared = await f.service.prepare(f.db, f.session, f.contracts);
    expect(
      f.db
        .prepare(
          "SELECT 1 FROM entity_identities WHERE entity_kind='whiteboard-content' AND local_id=42"
        )
        .get()
    ).toBeUndefined();
    const installed = await f.service.install(f.db, prepared.plan.operationId);
    installed.destroy();
    expect(
      f.db
        .prepare(
          "SELECT 1 FROM entity_identities WHERE entity_kind='whiteboard-content' AND local_id=42"
        )
        .get()
    ).toBeTruthy();
  });

  it("安装等待期间切换连接时拒绝覆盖，保全和原操作仍可续做", async () => {
    const f = await setup();
    const original = f.db.prepare("SELECT content FROM contents WHERE id=7").get();
    let current = true;
    const service = new ContentMigration(f.state, f.cache, f.assets, f.recovery, () => current);
    const prepared = await service.prepare(f.db, f.session, f.contracts);
    current = false;
    await expect(service.install(f.db, prepared.plan.operationId)).rejects.toThrow("连接已变化");
    expect(f.db.prepare("SELECT content FROM contents WHERE id=7").get()).toEqual(original);
    expect(f.state.migration(prepared.plan.operationId)?.decision).toBeUndefined();
    current = true;
    (await service.install(f.db, prepared.plan.operationId)).destroy();
    expect(f.state.migration(prepared.plan.operationId)?.phase).toBe("COMPLETE");
  });
});

it("后台重启超过旧准备期限仍按原候选续装，不复活已终止操作", async () => {
  const f = await setup();
  const prepared = await f.service.prepare(f.db, f.session, f.contracts);
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60_000);
  try {
    f.state.continueLocal(prepared.plan.operationId);
    (await f.service.install(f.db, prepared.plan.operationId)).destroy();
    expect(f.state.migration(prepared.plan.operationId)?.phase).toBe("COMPLETE");
    expect(() => f.state.continueLocal(prepared.plan.operationId)).toThrow("不能");
  } finally {
    now.mockRestore();
  }
});

it("主库安装后中断期间产生的新正文不能被旧候选续装覆盖", async () => {
  const f = await setup();
  const record = await f.service.prepare(f.db, f.session, f.contracts);
  await expect(
    f.service.install(f.db, record.plan.operationId, phase => {
      if (phase === "main") throw new Error("模拟中断");
    })
  ).rejects.toThrow("模拟中断");
  const installed = ContentDocumentTable.read(f.db, 7)!;
  installed.content[0].laterEdit = "中断后新内容";
  ContentDocumentTable.commit(f.db, 7, installed, {
    count: 1,
    expectedRevision: installed.revision,
  });
  const before = f.db.prepare("SELECT content FROM contents WHERE id=7").get();
  await expect(f.service.install(f.db, record.plan.operationId)).rejects.toThrow(
    "中断后已有新内容"
  );
  expect(f.db.prepare("SELECT content FROM contents WHERE id=7").get()).toEqual(before);
  expect(f.state.migration(record.plan.operationId)?.phase).not.toBe("COMPLETE");
  const cached = f.cache.load(f.session.info.id);
  expect(cached.doc.getMap("meta").get("version")).toBe(1);
  cached.doc.destroy();
});

it("旧缓存和主库不同先保全两个版本，不能以缓存覆盖新主库", async () => {
  const f = await setup();
  const next = JSON.parse(
    (f.db.prepare("SELECT content FROM contents WHERE id=7").get() as { content: string }).content
  );
  next[0].code = "另一设备写入的新版本";
  f.db.prepare("UPDATE contents SET content=? WHERE id=7").run(JSON.stringify(next));
  await expect(f.service.prepare(f.db, f.session, f.contracts)).rejects.toThrow("两个版本已保全");
  expect(ContentDocumentTable.read(f.db, 7)).toBeNull();
  expect(f.state.pendingMigrations()).toHaveLength(0);
  const receipt = f.state.db
    .prepare(
      "SELECT id,manifest_path AS manifestPath,manifest_hash AS manifestHash FROM recoveries"
    )
    .get() as import("../content-local-state").LocalRecoveryReceipt;
  expect(f.recovery.readFile(receipt, "source-projection.json").toString()).toContain(
    "另一设备写入的新版本"
  );
  const cached = new Y.Doc();
  Y.applyUpdate(cached, f.recovery.readFile(receipt, "document-before.bin"));
  expect(JSON.stringify(importedReadSharedContent(cached))).toContain("const 原文 = 1");
  cached.destroy();
});
