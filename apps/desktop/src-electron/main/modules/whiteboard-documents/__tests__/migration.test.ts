// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import schema from "@tau/db-schema/schema/main.sql?raw";
import {
  WhiteboardModel,
  createWhiteboardBaseline,
  whiteboardPublicationScope,
} from "@tau/collaboration";
import { ContentIdentityTable } from "../../tables/content-identity";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { WhiteboardMigration } from "../migration";
import { WhiteboardJournal, journalKey } from "../journal";
import { WhiteboardDocumentRepository } from "../repository";
import { convertLegacyWhiteboard } from "../legacy";
import { inventoryLegacyWhiteboards } from "../legacy-inventory";
const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(fn => fn())
);
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "whiteboard-w8-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const db = new Database(join(directory, "main.db"));
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  const cache = new CollaborationLocalStore(directory),
    state = new ContentLocalState(cache.db),
    journal = new WhiteboardJournal(join(directory, "journal.db"));
  cleanup.push(() => {
    if (db.open) db.close();
    if (cache.db.open) cache.db.close();
    if (journal.db.open) journal.close();
  });
  const doc = new Y.Doc({ gc: false }),
    model = new WhiteboardModel(doc);
  cleanup.push(() => {
    model.dispose();
    doc.destroy();
  });
  model.submit(
    [
      { type: "create_page", id: "visible", title: "显示页" },
      { type: "create_page", id: "hidden", title: "隐藏视图页" },
    ],
    null
  );
  const repo = new WhiteboardDocumentRepository(db, "A"),
    original = repo.create("local", model, "board");
  journal.seed({ ...original, projectedRevision: 0, projectedHash: original.hash }, []);
  const bundle = whiteboardPublicationScope(model, "local", ["visible", "hidden"]);
  bundle.pages[1].title = "新标题";
  const next = await createWhiteboardBaseline(bundle);
  cleanup.push(() => next.destroy());
  const migration = new WhiteboardMigration(state, journal);
  return { db, state, cache, journal, migration, original, next, repo, model };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  return f.migration.prepare(f.db, "A", {
    operationId: "operation",
    documentId: "local",
    candidate: Y.encodeStateAsUpdate(f.next),
    target: { boardId: f.original.boardId, pages: [] },
  });
}
describe("白板跨存储迁移恢复", () => {
  for (const crash of ["decision", "main", "journal", "complete"] as const)
    it(`${crash} 中断后按原决定续装，旧代次日志保留且不生成恢复包`, async () => {
      const f = await fixture(),
        record = await prepare(f);
      const pageIds = f.db
        .prepare("SELECT page_id,content_id FROM whiteboard_document_pages ORDER BY page_id")
        .all();
      await expect(
        f.migration.install(f.db, "A", "operation", phase => {
          if (phase === crash) throw new Error("crash");
        })
      ).rejects.toThrow("crash");
      expect(() => f.state.decideLocal("operation", "abort")).toThrow("已提交");
      const installed = await f.migration.install(f.db, "A", "operation");
      expect(installed.epoch).toBe(1);
      expect(f.state.migration("operation")?.phase).toBe("COMPLETE");
      expect(f.journal.load(journalKey(f.original))?.state).toEqual(f.original.state);
      expect(f.journal.load(journalKey(installed))?.hash).toBe(installed.hash);
      expect(
        f.db
          .prepare("SELECT page_id,content_id FROM whiteboard_document_pages ORDER BY page_id")
          .all()
      ).toEqual(pageIds);
      expect(
        (
          f.db
            .prepare(
              "SELECT name FROM white_board_contents WHERE id=(SELECT content_id FROM whiteboard_document_pages WHERE page_id='hidden')"
            )
            .get() as { name: string }
        ).name
      ).toBe("新标题");
      expect(record.plan).not.toHaveProperty("recovery");
      expect(record.phase).toBe("PREPARED");
      expect(record.plan.prepared?.candidate).toBe(
        Buffer.from(Y.encodeStateAsUpdate(f.next)).toString("base64")
      );
    });
  it("拒绝同名异源资料库、候选篡改与旧操作复活", async () => {
    const f = await fixture();
    await prepare(f);
    await expect(
      f.migration.prepare(f.db, "A", {
        operationId: "operation",
        documentId: "other",
        candidate: Y.encodeStateAsUpdate(f.next),
        target: { boardId: null, pages: [] },
      })
    ).rejects.toThrow("不能更换");
    f.db.prepare("UPDATE library_identity SET source_id='other' WHERE id=1").run();
    await expect(f.migration.install(f.db, "A", "operation")).rejects.toThrow("来源");
    f.state.decideLocal("operation", "abort");
    await expect(f.migration.install(f.db, "A", "operation")).rejects.toThrow("终止");
  });
  it("远端未确认不能安装，null 查询不代表取消", async () => {
    const f = await fixture();
    const bundle = whiteboardPublicationScope(f.model, "local", ["visible", "hidden"]);
    const candidate = await createWhiteboardBaseline(bundle, {
      documentId: "room",
      baselineId: "new",
      epoch: 3,
    });
    cleanup.push(() => candidate.destroy());
    await f.migration.prepare(f.db, "A", {
      operationId: "remote",
      documentId: "local",
      candidate: Y.encodeStateAsUpdate(candidate),
      target: { boardId: f.original.boardId, pages: [] },
      operation: {
        id: "remote",
        documentId: "room",
        actorId: "owner",
        expectedEpoch: 2,
        state: "PENDING",
        frozenRevision: "revision",
        expiresAt: Date.now() + 60_000,
      },
    });
    f.state.observeRemote("remote", null);
    await expect(f.migration.install(f.db, "A", "remote")).rejects.toThrow("服务端");
    expect(f.repo.read("local")?.epoch).toBe(0);
  });
});
describe("显式旧白板转换", () => {
  it("唯一旧 ID 换号后统一更新跨页连线与演示引用", async () => {
    const geometry = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const result = await convertLegacyWhiteboard([
      { id: "first", title: "第一页", data: { children: [
        { ...geometry, id: "arrow", type: "arrow", source: { bindId: "旧图形" }, target: {}, description: [] },
      ], presentationSequences: [{ id: "sequence", name: "演示", createTime: 1, updateTime: 1, frames: [{ id: "frame", elements: ["旧图形", "arrow"] }] }] } },
      { id: "second", title: "第二页", data: { children: [{ ...geometry, id: "旧图形", type: "missing.plugin", data: {} }] } },
    ], { documentId: "doc", title: "旧板", editorContracts: {}, resolveEntity: () => null, readExclusiveContent: () => null, mapResource: async value => value });
    cleanup.push(() => result.doc.destroy());
    const target = result.mapping.find(entry => entry.previousId === "旧图形")!.id;
    expect(target).not.toBe("旧图形");
    expect(result.bundle.pages[0].elements[0].data.source).toEqual({ bindId: target });
    expect(result.bundle.presentations[0].frames[0].elements).toEqual([target, "arrow"]);
  });
  it("重复 ID 与歧义连线不猜目标，缺插件与仅有 SVG 保真", async () => {
    const geometry = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const result = await convertLegacyWhiteboard(
      [
        {
          id: "page",
          title: "旧页",
          data: {
            children: [
              {
                ...geometry,
                id: "same",
                type: "missing.plugin",
                data: { svg: "<svg>唯一作品</svg>" },
              },
              { ...geometry, id: "same", type: "missing.plugin", data: { source: "two" } },
              {
                ...geometry,
                id: "arrow",
                type: "arrow",
                source: { bindId: "same" },
                target: {},
                description: [],
              },
            ],
          },
        },
      ],
      {
        documentId: "doc",
        title: "旧板",
        editorContracts: {},
        resolveEntity: () => null,
        readExclusiveContent: () => null,
        mapResource: async ref => ref,
      }
    );
    cleanup.push(() => result.doc.destroy());
    expect(new Set(result.mapping.map(value => value.id)).size).toBe(3);
    expect(result.mapping.filter(value => value.previousId === "same")).toHaveLength(2);
    expect(result.issues.some(issue => issue.reason === "ambiguous-connection")).toBe(true);
    expect(JSON.stringify(result.bundle)).toContain("唯一作品");
  });
  it("盘点独立内嵌页，拒绝一个页被多个白板认领", async () => {
    const f = await fixture();
    f.db
      .prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(900,1,1,'独立','{\"children\":[]}',1)"
      )
      .run();
    ContentIdentityTable.reference(f.db, "whiteboard-content", 900);
    expect(inventoryLegacyWhiteboards(f.db).map(item => item.pages[0].contentId)).toEqual([900]);
    f.db
      .prepare(
        "INSERT INTO white_boards(create_time,update_time,title,tags,white_board_content_ids) VALUES(1,1,'A','[]','[900]'),(2,2,'B','[]','[900]')"
      )
      .run();
    expect(() => inventoryLegacyWhiteboards(f.db)).toThrow("归属");
  });
});

describe("净化首次发布与恢复", () => {
  async function publication() {
    const f = await fixture();
    const { CollaborationStore } = await import("../../../../../../collaboration-server/src/store");
    const { loadConfig } = await import("../../../../../../collaboration-server/src/config");
    const { WhiteboardTransitions } = await import("../transitions");
    const remoteDir = mkdtempSync(join(tmpdir(), "whiteboard-w8-server-"));
    const server = new CollaborationStore(loadConfig({ dataDir: remoteDir }));
    cleanup.push(() => {
      server.close();
      rmSync(remoteDir, { recursive: true, force: true });
    });
    const owner = server.register("owner");
    let lost = true,
      failAssets = false;
    const candidates: string[] = [];
    const client = {
      canonicalUrl: (url: string) => url,
      serverTime: () => Date.now(),
      request: async (_url: string, path: string, _method?: string, body?: any) => {
        if (path === "/v1/documents") return server.create(owner.id, body.idempotencyKey);
        const [, , , id, action, more] = path.split("/");
        if (action === "publish") {
          candidates.push(body.state);
          const result = await server.publish(id, owner.id, Buffer.from(body.state, "base64"));
          if (lost) {
            lost = false;
            throw new Error("响应丢失");
          }
          return result;
        }
        if (action === "publication")
          return more === "cancel"
            ? server.cancelPublication(id, owner.id)
            : server.publicationStatus(id, owner.id);
        throw new Error("测试未知路径");
      },
    };
    const assets = {
      flush: async () => {
        if (failAssets) throw new Error("资源失败");
      },
    };
    const transitions = new WhiteboardTransitions(
      f.migration,
      f.cache,
      client as never,
      assets as never
    );
    return {
      ...f,
      server,
      transitions,
      candidates,
      setAssetsFailure: () => {
        failAssets = true;
      },
    };
  }
  it("发布响应丢失不换候选，不提前本机安装，重启式续做只建立一个房间", async () => {
    const f = await publication();
    await expect(
      f.transitions.publish(f.db, "A", "local", {
        operationId: "publish",
        serverUrl: "https://test.invalid",
        pageIds: ["visible", "hidden"],
      })
    ).rejects.toThrow("响应丢失");
    await expect(f.migration.install(f.db, "A", "publish")).rejects.toThrow("耐久服务端回执");
    expect(f.repo.read("local")?.epoch).toBe(0);
    const result = await f.transitions.resumePublication(f.db, "A", "publish");
    expect(f.candidates).toHaveLength(2);
    expect(f.candidates[0]).toBe(f.candidates[1]);
    expect(f.server.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
    expect(f.repo.read("local")?.epoch).toBe(1);
    expect(f.cache.get(`whiteboard-binding:A:local`, null)).toEqual(result);
    await expect(f.transitions.cancelPublication("A", "publish")).rejects.toThrow("已激活");
  });
  it("服务端激活后主库安装失败，凭原回执继续安装", async () => {
    const f = await publication();
    await expect(
      f.transitions.publish(f.db, "A", "local", {
        operationId: "publish",
        serverUrl: "https://test.invalid",
        pageIds: ["visible"],
      })
    ).rejects.toThrow("响应丢失");
    f.db.exec(
      "CREATE TEMP TRIGGER fail_install BEFORE UPDATE ON whiteboard_documents BEGIN SELECT RAISE(ABORT, 'disk full'); END"
    );
    await expect(f.transitions.resumePublication(f.db, "A", "publish")).rejects.toThrow(
      "disk full"
    );
    expect(f.state.migration("publish")?.decision).toBeDefined();
    expect(f.repo.read("local")?.epoch).toBe(0);
    f.db.exec("DROP TRIGGER fail_install");
    await f.transitions.resumePublication(f.db, "A", "publish");
    expect(f.state.migration("publish")?.phase).toBe("COMPLETE");
    expect(f.server.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
  });
  it("资产暂存失败可原子取消，关闭终态不能被原请求复活", async () => {
    const f = await publication();
    f.setAssetsFailure();
    await expect(
      f.transitions.publish(f.db, "A", "local", {
        operationId: "cancel",
        serverUrl: "https://test.invalid",
        pageIds: ["visible"],
      })
    ).rejects.toThrow("资源失败");
    await f.transitions.cancelPublication("A", "cancel");
    await expect(f.transitions.resumePublication(f.db, "A", "cancel")).rejects.toThrow("取消");
    expect(f.transitions.blocked("A", "local")).toBe(false);
    expect(f.repo.read("local")?.epoch).toBe(0);
    expect(f.server.db.prepare("SELECT status FROM documents").get()).toEqual({ status: "closed" });
  });
});

it("选定完整库转换主库失败可重试，主库提交后重开存储只能续做，不能取消已安装候选", async () => {
  const f = await fixture();
  f.db.exec(
    "DELETE FROM whiteboard_document_pages; DELETE FROM whiteboard_documents; DELETE FROM white_boards; DELETE FROM white_board_contents; DELETE FROM entity_identities; DELETE FROM library_identity;"
  );
  f.db
    .prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(701,1,1,'独立旧页','{\"version\":2,\"children\":[]}',1)"
    )
    .run();
  const { prepareWhiteboardLibraryBaseline } = await import("../library-baseline");
  const first = await prepareWhiteboardLibraryBaseline(f.db, "A", "baseline", f.cache);
  const retry = await prepareWhiteboardLibraryBaseline(f.db, "A", "baseline", f.cache);
  expect(first.baseline).toEqual(retry.baseline);
  expect(ContentIdentityTable.library(f.db)).toBeNull();
  const target = first.documents[0];
  const candidate = await createWhiteboardBaseline({
    format: "whiteboard-transfer-v1",
    sourceDocumentId: target.documentId,
    title: target.title,
    pages: target.pages.map(page => ({ id: page.pageId, title: page.title, elements: [] })),
    contracts: {},
    resources: [],
    presentations: [],
  });
  cleanup.push(() => candidate.destroy());
  await f.migration.prepare(f.db, "A", {
    operationId: "baseline",
    documentId: target.documentId,
    candidate: Y.encodeStateAsUpdate(candidate),
    target,
    baseline: { hash: first.hash, value: first.baseline },
  });
  f.db.exec(
    "CREATE TEMP TRIGGER fail_baseline BEFORE INSERT ON whiteboard_documents BEGIN SELECT RAISE(ABORT, 'install failed'); END"
  );
  await expect(f.migration.install(f.db, "A", "baseline")).rejects.toThrow("install failed");
  expect(ContentIdentityTable.library(f.db)).toBeNull();
  expect(f.state.migration("baseline")?.decision).toBeUndefined();
  f.db.exec("DROP TRIGGER fail_baseline");
  await expect(f.migration.install(f.db, "A", "baseline", phase => {
    if (phase === "main") throw new Error("主库提交后退出");
  })).rejects.toThrow("主库提交后退出");
  expect(f.state.migration("baseline")?.decision).toBeUndefined();
  const filename = f.db.name, directory = dirname(f.cache.db.name), journalName = f.journal.db.name;
  f.db.close(); f.cache.db.close(); f.journal.close();
  const db = new Database(filename), cache = new CollaborationLocalStore(directory), journal = new WhiteboardJournal(journalName);
  cleanup.push(() => { db.close(); cache.db.close(); journal.close(); });
  const restored = new WhiteboardMigration(new ContentLocalState(cache.db), journal);
  expect((await restored.cancel(db, "A", "baseline")).phase).toBe("COMPLETE");
  expect(ContentIdentityTable.library(db)?.sourceId).toBe(first.baseline.library.source_id);
  expect(new WhiteboardDocumentRepository(db, "A").byPage(701)?.pageId).toBe(target.pages[0].pageId);
  const copyPath = join(dirname(filename), "copy.db");
  await db.backup(copyPath);
  const copy = new Database(copyPath);
  try {
    expect(ContentIdentityTable.reference(copy, "whiteboard-content", 701)).toEqual(
      ContentIdentityTable.reference(db, "whiteboard-content", 701)
    );
  } finally {
    copy.close();
  }
});
