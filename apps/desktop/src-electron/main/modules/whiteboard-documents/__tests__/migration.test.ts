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
import { convertLegacyWhiteboard, type LegacyWhiteboardPage } from "../legacy";
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
  const shape = (id: string, x = 0) => ({
    id,
    type: "frame",
    x,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    title: id,
  });
  const presentation = (id: string, frames: { id: string; elements: string[] }[]) => ({
    id,
    name: "演示",
    createTime: 1,
    updateTime: 2,
    frames,
  });
  const convertPresentations = async (pages: LegacyWhiteboardPage[]) => {
    const result = await convertLegacyWhiteboard(pages, {
      documentId: "doc",
      title: "旧白板",
      editorContracts: {},
      resolveEntity: () => null,
      mapResource: async value => value,
    });
    cleanup.push(() => result.doc.destroy());
    return result;
  };

  it("正常帧与重复 ID 帧同时保留，八次引用逐一映射八个元素并可重新读取", async () => {
    const frames = [
      { id: "normal", elements: ["before", "after"] },
      {
        id: "duplicates",
        elements: ["same", "before", ...Array<string>(7).fill("same"), "after"],
        viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      },
      { id: "again", elements: Array<string>(8).fill("same") },
    ];
    const pages: LegacyWhiteboardPage[] = [
      {
        id: "page",
        title: "",
        data: {
          children: [
            shape("before"),
            {
              ...shape("container"),
              children: Array.from({ length: 8 }, (_, i) => shape("same", i * 100)),
            },
            shape("after"),
          ],
          presentationSequences: [presentation("sequence", frames)],
        },
      },
    ];
    const original = structuredClone(pages);
    const result = await convertPresentations(pages);
    const ids = result.mapping.filter(entry => entry.previousId === "same").map(entry => entry.id);
    expect(new Set(ids).size).toBe(8);
    const converted = result.bundle.presentations[0];
    expect(converted).toMatchObject({ id: "sequence", name: "演示", createTime: 1, updateTime: 2 });
    expect(converted.frames).toEqual([
      frames[0],
      { ...frames[1], elements: [ids[0], "before", ...ids.slice(1), "after"] },
      { ...frames[2], elements: ids },
    ]);
    expect(result.issues).toEqual([]);
    expect(pages).toEqual(original);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(result.doc));
    const model = new WhiteboardModel(restored);
    try {
      await model.validate();
      expect(model.read().presentations).toEqual([
        { ...converted, frames: converted.frames.map(({ id, elements }) => ({ id, elements })) },
      ]);
    } finally {
      model.dispose();
      restored.destroy();
    }
  });

  it("跨页重复 ID 优先匹配当前页，仍能引用后续页面的唯一元素", async () => {
    const result = await convertPresentations([
      {
        id: "first",
        title: "",
        data: {
          children: [shape("same")],
          presentationSequences: [
            presentation("first-sequence", [{ id: "first-frame", elements: ["same", "later"] }]),
          ],
        },
      },
      {
        id: "second",
        title: "",
        data: {
          children: [shape("same"), shape("same", 100), shape("later")],
          presentationSequences: [
            presentation("second-sequence", [{ id: "second-frame", elements: ["same", "same"] }]),
          ],
        },
      },
    ]);
    const first = result.mapping.filter(
      entry => entry.pageId === "first" && entry.previousId === "same"
    );
    const second = result.mapping.filter(
      entry => entry.pageId === "second" && entry.previousId === "same"
    );
    expect(result.bundle.presentations[0].frames[0].elements).toEqual([first[0].id, "later"]);
    expect(result.bundle.presentations[1].frames[0].elements).toEqual(
      second.map(entry => entry.id)
    );
    expect(result.issues).toEqual([]);
  });

  it.each([1, 3])(
    "重复 ID 引用 %i 次但候选为两个时，仅报告该引用，正常帧和空帧仍保留",
    async count => {
      const pages: LegacyWhiteboardPage[] = [
        {
          id: "page",
          title: "",
          data: {
            children: [shape("good"), shape("same"), shape("same", 100)],
            presentationSequences: [
              presentation("sequence", [
                { id: "normal", elements: ["good", "good"] },
                {
                  id: "partial",
                  elements: ["good", ...Array<string>(count).fill("same"), "missing"],
                },
                { id: "unresolved", elements: ["missing"] },
                { id: "last", elements: ["good"] },
              ]),
            ],
          },
        },
      ];
      const original = structuredClone(pages);
      const result = await convertPresentations(pages);
      expect(result.bundle.presentations[0].frames).toEqual([
        { id: "normal", elements: ["good"] },
        { id: "partial", elements: ["good"] },
        { id: "unresolved", elements: [] },
        { id: "last", elements: ["good"] },
      ]);
      expect(result.issues).toEqual([
        {
          pageId: "page",
          nodeId: "sequence",
          frameId: "partial",
          previousId: "same",
          reason: "ambiguous-presentation-reference",
        },
        {
          pageId: "page",
          nodeId: "sequence",
          frameId: "partial",
          previousId: "missing",
          reason: "missing-presentation-reference",
        },
        {
          pageId: "page",
          nodeId: "sequence",
          frameId: "unresolved",
          previousId: "missing",
          reason: "missing-presentation-reference",
        },
      ]);
      expect(pages).toEqual(original);
      const model = new WhiteboardModel(result.doc);
      try {
        await model.validate();
        expect(model.read().presentations?.[0].frames).toEqual(
          result.bundle.presentations[0].frames
        );
      } finally {
        model.dispose();
      }
    }
  );

  it("唯一旧 ID 换号后统一更新跨页连线与演示引用", async () => {
    const geometry = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const result = await convertLegacyWhiteboard(
      [
        {
          id: "first",
          title: "第一页",
          data: {
            children: [
              {
                ...geometry,
                id: "arrow",
                type: "arrow",
                source: { bindId: "旧图形" },
                target: {},
                description: [],
              },
            ],
            presentationSequences: [
              {
                id: "sequence",
                name: "演示",
                createTime: 1,
                updateTime: 1,
                frames: [{ id: "frame", elements: ["旧图形", "arrow"] }],
              },
            ],
          },
        },
        {
          id: "second",
          title: "第二页",
          data: { children: [{ ...geometry, id: "旧图形", type: "missing.plugin", data: {} }] },
        },
      ],
      {
        documentId: "doc",
        title: "旧板",
        editorContracts: {},
        resolveEntity: () => null,
        mapResource: async value => value,
      }
    );
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
  await expect(
    f.migration.install(f.db, "A", "baseline", phase => {
      if (phase === "main") throw new Error("主库提交后退出");
    })
  ).rejects.toThrow("主库提交后退出");
  expect(f.state.migration("baseline")?.decision).toBeUndefined();
  const filename = f.db.name,
    directory = dirname(f.cache.db.name),
    journalName = f.journal.db.name;
  f.db.close();
  f.cache.db.close();
  f.journal.close();
  const db = new Database(filename),
    cache = new CollaborationLocalStore(directory),
    journal = new WhiteboardJournal(journalName);
  cleanup.push(() => {
    db.close();
    cache.db.close();
    journal.close();
  });
  const restored = new WhiteboardMigration(new ContentLocalState(cache.db), journal);
  expect((await restored.cancel(db, "A", "baseline")).phase).toBe("COMPLETE");
  expect(ContentIdentityTable.library(db)?.sourceId).toBe(first.baseline.library.source_id);
  expect(new WhiteboardDocumentRepository(db, "A").byPage(701)?.pageId).toBe(
    target.pages[0].pageId
  );
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

it("自动转换的保全文件损坏时拒绝安装，原白板和未决操作保留", async () => {
  const { ContentRecoveryStore } = await import("../../collaboration/content-recovery");
  const { writeFileSync } = await import("node:fs");
  const f = await fixture();
  const recovery = new ContentRecoveryStore(dirname(f.cache.db.name), f.state);
  const receipt = recovery.save({
    workspaceId: "A",
    reason: "migration",
    provenance: { kind: "whiteboard" },
    missing: [],
    files: [{ name: "source-pages.json", bytes: Buffer.from("原白板") }],
  });
  const record = await f.migration.prepare(f.db, "A", {
    operationId: "auto",
    documentId: "local",
    candidate: Y.encodeStateAsUpdate(f.next),
    target: { boardId: f.original.boardId, pages: [] },
    evidence: { recovery: receipt },
  });
  writeFileSync(join(dirname(receipt.manifestPath), "source-pages.json"), "损坏");
  await expect(f.migration.install(f.db, "A", record.plan.operationId)).rejects.toThrow();
  expect(f.repo.read("local")?.hash).toBe(f.original.hash);
  expect(f.state.migration("auto")?.decision).toBeUndefined();
});

for (const field of ["page", "board"] as const)
  it(`旧白板转换准备后修改${field === "page" ? "页名" : "标题"}不得被旧候选覆盖`, async () => {
    const f = await fixture();
    f.db
      .prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(900,1,1,'旧页名',?,1)"
      )
      .run(JSON.stringify({ children: [] }));
    f.db
      .prepare(
        "INSERT INTO white_boards(id,create_time,update_time,title,tags,white_board_content_ids) VALUES(900,1,1,'旧板名','[]','[900]')"
      )
      .run();
    const target = inventoryLegacyWhiteboards(f.db, true).find(entry => entry.boardId === 900)!;
    const converted = await convertLegacyWhiteboard(
      target.pages.map(page => ({
        id: page.pageId,
        title: page.title,
        data: JSON.parse(page.data),
      })),
      {
        documentId: target.documentId,
        title: target.title,
        editorContracts: {},
        resolveEntity: () => null,
        mapResource: async value => value,
      }
    );
    cleanup.push(() => converted.doc.destroy());
    const record = await f.migration.prepare(f.db, "A", {
      operationId: "renamed",
      documentId: target.documentId,
      candidate: Y.encodeStateAsUpdate(converted.doc),
      target: { boardId: 900, boardTitle: target.title, pages: target.pages },
    });
    if (field === "page")
      f.db.prepare("UPDATE white_board_contents SET name='新页名' WHERE id=900").run();
    else f.db.prepare("UPDATE white_boards SET title='新板名' WHERE id=900").run();
    await expect(f.migration.install(f.db, "A", record.plan.operationId)).rejects.toThrow("变化");
    expect(f.repo.read(target.documentId)).toBeNull();
    expect(f.state.migration(record.plan.operationId)?.decision).toBeUndefined();
    const actual =
      field === "page"
        ? f.db.prepare("SELECT name AS value FROM white_board_contents WHERE id=900").get()
        : f.db.prepare("SELECT title AS value FROM white_boards WHERE id=900").get();
    expect(actual).toEqual({ value: field === "page" ? "新页名" : "新板名" });
  });

it("旧连线只存折点时从折点派生矩形，保留原始点和连接", async () => {
  const points = [
    { x: 120, y: -30 },
    { x: 80, y: 40 },
  ];
  const result = await convertLegacyWhiteboard(
    [
      {
        id: "page",
        title: "",
        data: {
          children: [
            {
              id: "line",
              type: "arrow",
              points,
              source: { marker: "none" },
              target: { marker: "arrow" },
              description: [],
            },
          ],
        },
      },
    ],
    {
      documentId: "doc",
      title: "",
      editorContracts: {},
      resolveEntity: () => null,
      mapResource: async ref => ref,
    }
  );
  try {
    expect(result.bundle.pages[0].elements[0].geometry).toEqual({
      x: 80,
      y: -30,
      width: 40,
      height: 70,
      rotation: 0,
    });
    expect(result.bundle.pages[0].elements[0].data.points).toEqual(points);
    expect(result.issues).toEqual([]);
  } finally {
    result.doc.destroy();
  }
});

it("分栏中的旧文本保留原位置与正文引用，不把缓存复制成板内正文", async () => {
  const geometry = { x: 0, y: 0, width: 100, height: 40, rotation: 0 };
  const result = await convertLegacyWhiteboard(
    [
      {
        id: "page",
        title: "",
        data: {
          children: [
            {
              ...geometry,
              id: "column",
              type: "column",
              title: "分栏",
              children: [
                {
                  ...geometry,
                  id: "text",
                  type: "richtext",
                  contentId: 7,
                  content: [{ type: "paragraph", children: [{ text: "过时缓存" }] }],
                },
              ],
            },
          ],
        },
      },
    ],
    {
      documentId: "doc",
      title: "",
      editorContracts: {},
      resolveEntity: kind => ({ sourceId: "source", kind, entityId: "entity" }),
      mapResource: async ref => ref,
    }
  );
  try {
    const child = result.bundle.pages[0].elements[0].children[0];
    expect(child.id).toBe("text");
    expect(child.type).toBe("richtext");
    expect(child.geometry).toEqual(geometry);
    expect(child.body).toEqual([]);
    expect(child.entity).toEqual({ sourceId: "source", kind: "content", entityId: "entity" });
    expect(result.issues).toEqual([]);
  } finally {
    result.doc.destroy();
  }
});

it("无标签旧箭头保留连线，损坏的非数组标签仍保全原载荷", async () => {
  const geometry = { x: 0, y: 0, width: 100, height: 40, rotation: 0 };
  const result = await convertLegacyWhiteboard(
    [
      {
        id: "page",
        title: "",
        data: {
          children: [
            {
              ...geometry,
              id: "empty",
              type: "arrow",
              source: {},
              target: {},
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 40 },
              ],
            },
            { ...geometry, id: "invalid", type: "arrow", description: "损坏标签" },
          ],
        },
      },
    ],
    {
      documentId: "doc",
      title: "",
      editorContracts: {},
      resolveEntity: () => null,
      mapResource: async ref => ref,
    }
  );
  try {
    const [empty, invalid] = result.bundle.pages[0].elements;
    expect(empty.type).toBe("arrow");
    expect(empty.body).toEqual([]);
    expect(empty.data.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 40 },
    ]);
    expect(invalid.type).toBe("host.whiteboard.recovery");
    expect(result.issues).toEqual([
      { pageId: "page", nodeId: "invalid", reason: "missing-or-invalid-body" },
    ]);
  } finally {
    result.doc.destroy();
  }
});

it("旧白板重复引用接管计数，事务失败和主库提交后中断重试均不重复增减", async () => {
  const f = await fixture();
  const data = JSON.stringify({
    version: 2,
    children: ["first", "second"].map(id => ({
      id,
      type: "whiteboard",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      whiteBoardContentId: 901,
    })),
  });
  f.db
    .prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(900,1,1,'源页',?,1),(901,2,2,'目标页','{\"children\":[]}',2)"
    )
    .run(data);
  const target = inventoryLegacyWhiteboards(f.db, true).find(
    entry => entry.pages[0].contentId === 900
  )!;
  const converted = await convertLegacyWhiteboard(
    target.pages.map(page => ({ id: page.pageId, title: page.title, data: JSON.parse(page.data) })),
    {
      documentId: target.documentId,
      title: target.title,
      editorContracts: {},
      resolveEntity: (kind, id) => ContentIdentityTable.reference(f.db, kind, id),
      mapResource: async value => value,
    }
  );
  cleanup.push(() => converted.doc.destroy());
  const changes: number[] = [];
  const counts = (
    db: Database.Database,
    _kind: "whiteboard-content" | "data-table",
    id: number,
    delta: number
  ) => {
    changes.push(delta);
    db.prepare("UPDATE white_board_contents SET ref_count=ref_count+? WHERE id=?").run(delta, id);
  };
  const migration = new WhiteboardMigration(f.state, f.journal, counts);
  await migration.prepare(f.db, "A", {
    operationId: "count-transfer",
    documentId: target.documentId,
    candidate: Y.encodeStateAsUpdate(converted.doc),
    target,
  });
  f.db.exec(
    "CREATE TEMP TRIGGER fail_projection BEFORE UPDATE ON white_board_contents BEGIN SELECT RAISE(ABORT, 'projection failed'); END"
  );
  await expect(migration.install(f.db, "A", "count-transfer")).rejects.toThrow("projection failed");
  expect(f.db.prepare("SELECT ref_count FROM white_board_contents WHERE id=901").get()).toEqual({
    ref_count: 2,
  });
  expect(f.repo.byPage(900)).toBeNull();
  f.db.exec("DROP TRIGGER fail_projection");
  await expect(
    migration.install(f.db, "A", "count-transfer", phase => {
      if (phase === "main") throw new Error("crash");
    })
  ).rejects.toThrow("crash");
  const restored = new WhiteboardMigration(f.state, f.journal, counts);
  await restored.install(f.db, "A", "count-transfer");
  await restored.install(f.db, "A", "count-transfer");
  expect(changes).toEqual([]);
  expect(f.db.prepare("SELECT ref_count FROM white_board_contents WHERE id=901").get()).toEqual({
    ref_count: 2,
  });
  expect(
    f.db
      .prepare("SELECT COUNT(*) total FROM whiteboard_entity_relations WHERE document_id=?")
      .get(target.documentId)
  ).toEqual({ total: 2 });
  expect(f.state.migration("count-transfer")?.phase).toBe("COMPLETE");
});

it("旧白板只接管内嵌正文的有效引用，不接管外部正文和未折叠缓存", async () => {
  const { legacyWhiteboardReferenceCounts } = await import("../legacy");
  const ref = { type: "database", tableId: 42, children: [] };
  expect(
    await legacyWhiteboardReferenceCounts([
      {
        data: JSON.stringify({
          children: [
            {
              type: "richtext",
              content: [
                ref,
                { type: "list-item", isFold: true, children: [], allContent: [{ text: "" }, ref] },
              ],
            },
            { type: "geometry", text: { content: [ref] } },
            { type: "arrow", description: [ref] },
            { type: "richtext", contentId: 10, content: [ref] },
            {
              type: "richtext",
              content: [{ type: "list-item", isFold: false, children: [], allContent: [ref, ref] }],
            },
            { type: "unknown-plugin", content: [ref] },
          ],
        }),
      },
    ])
  ).toEqual(Array.from({ length: 4 }, () => ({ kind: "data-table", id: 42 })));
});

it("先更新的官方火柴人插件为旧白板提供版本 1 契约，保持图形载荷", async () => {
  const { prepareWhiteboardContract } = await import("@tau/db-schema/content-contracts");
  const prepared = await prepareWhiteboardContract("taunote.stickman", {
    type: "taunote.stickman.figure",
    dataVersion: 1,
  });
  const data = { pose: "stand", body: "classic", tint: "mono", flip: false };
  const convert = (schemaVersion: number) =>
    convertLegacyWhiteboard(
      [
        {
          id: "page",
          title: "",
          data: {
            children: [
              {
                id: "figure",
                type: "taunote.stickman.figure",
                schemaVersion,
                x: 1,
                y: 2,
                width: 100,
                height: 120,
                data,
              },
            ],
          },
        },
      ],
      {
        documentId: "board",
        title: "",
        editorContracts: { [prepared.id]: prepared.contract },
        resolveEntity: () => null,
        mapResource: async ref => ref,
      }
    );
  const result = await convert(1);
  cleanup.push(() => result.doc.destroy());
  expect(result.issues).toEqual([]);
  expect(result.bundle.pages[0].elements[0]).toMatchObject({
    type: "taunote.stickman.figure",
    contractId: prepared.id,
    data,
    geometry: { x: 1, y: 2, width: 100, height: 120 },
  });
  expect(result.bundle.pages[0].elements[0].data).not.toHaveProperty("schemaVersion");
  const unknown = await convert(2);
  cleanup.push(() => unknown.doc.destroy());
  expect(unknown.issues).toHaveLength(1);
  expect(unknown.bundle.pages[0].elements[0]).toMatchObject({
    type: "host.whiteboard.recovery",
    data: { original: { schemaVersion: 2, data } },
  });
});
