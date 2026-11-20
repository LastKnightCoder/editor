// @vitest-environment node
import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentNode } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { getContentLength } from "@/utils/helper";
import { restoreContentBinding } from "../../collaboration/content-repository";
import { SqliteContentProjection } from "../../content-runtime/sqlite-content-projection";
import { ContentDocumentTable } from "../content-document";
import { ContentDocumentBlocks } from "../content-document-blocks";

vi.mock("electron");
vi.mock("../../video-note-index-queue");

interface StorageFixture {
  fixtureVersion: number;
  sourceId: string;
  libraryBaselineId: string;
  documentId: string;
  contentId: number;
  createdAt: number;
  mobileWrittenAt: number;
  cardId: number;
  articleId: number;
  contracts: ContentContractDictionary;
  desktopInitial: ContentNode[];
  mobileExpected: ContentNode[];
  desktopExpected: ContentNode[];
  counts: { initial: number; mobile: number; desktop: number };
  expectedOwnerReferences: number;
}

interface SharedFixture {
  fixtureVersion: number;
  databaseName: string;
  binding: { documentId: string; serverUrl: string };
  contract: ContentContractDictionary;
  desktopNode: ContentNode;
  mobileNode: ContentNode;
  tables: { tableId: number; rowContentId: number; rowDocumentId: string }[];
  rowBefore: ContentNode[];
  rowAfter: ContentNode[];
  expectedBefore: { tableRefs: number[]; rowRefs: number[]; pendingRows: number[] };
  expectedAfter: SharedFixture["expectedBefore"];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const baselineBytes = readFileSync(
  join(root, "packages/db-schema/fixtures/content-storage-roundtrip-v1.json")
);
const sharedBytes = readFileSync(
  join(root, "packages/db-schema/fixtures/content-storage-roundtrip-g4.json")
);
const baseline = JSON.parse(baselineBytes.toString("utf8")) as StorageFixture;
const sharedFixture = JSON.parse(sharedBytes.toString("utf8")) as SharedFixture;
const execute = promisify(execFile);
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
});

function assertMain(
  db: Database.Database,
  fixture: StorageFixture,
  expected: ContentNode[],
  count: number,
  layout: number
) {
  const row = db
    .prepare("SELECT content,count,ref_count FROM content_snapshots WHERE id=?")
    .get(fixture.contentId) as {
    content: string;
    count: number;
    ref_count: number;
  };
  expect(JSON.parse(row.content)).toEqual(expected);
  expect(row.count).toBe(count);
  expect(row.ref_count).toBe(fixture.expectedOwnerReferences);
  const metadata = db
    .prepare(
      "SELECT document_id,format_version,contracts FROM content_documents WHERE content_id=?"
    )
    .get(fixture.contentId) as {
    document_id: string;
    format_version: number;
    contracts: string;
  };
  expect(metadata.document_id).toBe(fixture.documentId);
  expect(metadata.format_version).toBe(layout);
  expect(JSON.parse(metadata.contracts)).toEqual(fixture.contracts);
  expect(db.prepare("SELECT source_id,baseline_id FROM library_identity WHERE id=1").get()).toEqual(
    { source_id: fixture.sourceId, baseline_id: fixture.libraryBaselineId }
  );
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(db.pragma("quick_check", { simple: true })).toBe("ok");
}

function seedDataTables(db: Database.Database) {
  for (const { tableId, rowContentId, rowDocumentId } of sharedFixture.tables) {
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(?,?,?,'[]',0,0)"
    ).run(rowContentId, baseline.createdAt, baseline.createdAt);
    db.prepare("INSERT INTO content_pending_releases VALUES(?,?)").run(
      rowContentId,
      baseline.createdAt
    );
    ContentDocumentTable.commit(
      db,
      rowContentId,
      {
        documentId: rowDocumentId,
        contracts: baseline.contracts,
        content: structuredClone(sharedFixture.rowBefore),
      },
      { installDocument: true, count: 4 }
    );
    db.prepare(
      "INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES (?,?,?,?,?,0)"
    ).run(
      tableId,
      baseline.createdAt,
      baseline.createdAt,
      JSON.stringify([{ id: "rt", type: "rich-text" }]),
      JSON.stringify([
        {
          id: "row",
          detailContentId: rowContentId,
          rt: [{ contentId: rowContentId }, { contentId: rowContentId }],
        },
      ])
    );
    db.prepare(
      "INSERT INTO entity_identities(entity_kind,entity_id,local_id,created_at) VALUES('data-table',?,?,?)"
    ).run(`roundtrip-database-${tableId}`, tableId, baseline.createdAt);
  }
}

function assertDataTables(db: Database.Database, migrated: boolean) {
  const expected = migrated ? sharedFixture.expectedAfter : sharedFixture.expectedBefore;
  expect(db.prepare("SELECT ref_count FROM data_tables ORDER BY id").pluck().all()).toEqual(
    expected.tableRefs
  );
  expect(
    db
      .prepare("SELECT ref_count FROM contents WHERE id<>? ORDER BY id")
      .pluck()
      .all(baseline.contentId)
  ).toEqual(expected.rowRefs);
  expect(
    db.prepare("SELECT content_id FROM content_pending_releases ORDER BY content_id").pluck().all()
  ).toEqual(expected.pendingRows);
  expect(db.prepare("SELECT table_id FROM data_table_pending_releases").pluck().all()).toEqual(
    migrated ? [sharedFixture.tables[0].tableId] : []
  );
  for (const [index, { rowContentId, rowDocumentId }] of sharedFixture.tables.entries()) {
    expect(ContentDocumentTable.read(db, rowContentId)).toMatchObject({
      documentId: rowDocumentId,
      contracts: baseline.contracts,
      content: migrated && index === 1 ? sharedFixture.rowAfter : sharedFixture.rowBefore,
    });
  }
}

describe.runIf(process.env.TAU_CONTENT_STORAGE_ROUNDTRIP === "1")(
  "桌面与真实移动 Rust 存储往返",
  () => {
    it.each([
      { label: "G0 普通正文", shared: false },
      { label: "G4 共享绑定、数据表及行正文", shared: true },
    ])(
      "$label 从布局 3 经移动写回布局 2，桌面继续块级保存",
      async ({ shared }) => {
        const fixture: StorageFixture = shared
          ? {
              ...baseline,
              fixtureVersion: sharedFixture.fixtureVersion,
              contracts: { ...baseline.contracts, ...sharedFixture.contract },
              desktopInitial: [...baseline.desktopInitial, sharedFixture.desktopNode],
              mobileExpected: [...baseline.mobileExpected, sharedFixture.mobileNode],
              desktopExpected: [...baseline.desktopExpected, sharedFixture.mobileNode],
            }
          : baseline;
        const directory = mkdtempSync(join(tmpdir(), "tau-content-storage-roundtrip-"));
        cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
        const path = join(directory, "roundtrip.db");
        const initial = new Database(path);
        cleanup.push(() => initial.open && initial.close());
        initial.exec(schema);
        initial
          .prepare(
            "INSERT INTO library_identity(id,source_id,baseline_id,create_time) VALUES(1,?,?,?)"
          )
          .run(fixture.sourceId, fixture.libraryBaselineId, fixture.createdAt);
        initial
          .prepare(
            "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(?,?,?,'[]',0,?)"
          )
          .run(
            fixture.contentId,
            fixture.createdAt,
            fixture.createdAt,
            fixture.expectedOwnerReferences
          );
        for (const id of [21, 22]) {
          initial
            .prepare(
              "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES(?,?,?,'{}',0)"
            )
            .run(id, fixture.createdAt, fixture.createdAt);
          initial
            .prepare(
              "INSERT INTO entity_identities(entity_kind,entity_id,local_id,created_at) VALUES('whiteboard-content',?,?,?)"
            )
            .run(`roundtrip-board-${id}`, id, fixture.createdAt);
        }
        initial
          .prepare(
            "INSERT INTO cards(id,create_time,update_time,tags,content_id) VALUES(?,?,?,'[\"保留卡片标签\"]',?)"
          )
          .run(fixture.cardId, fixture.createdAt, fixture.createdAt, fixture.contentId);
        initial
          .prepare(
            "INSERT INTO articles(id,create_time,update_time,title,tags,content_id) VALUES(?,?,?,'保留文章标题','[\"保留文章标签\"]',?)"
          )
          .run(fixture.articleId, fixture.createdAt, fixture.createdAt, fixture.contentId);
        if (shared) seedDataTables(initial);
        const saved = ContentDocumentTable.commit(
          initial,
          fixture.contentId,
          {
            documentId: fixture.documentId,
            contracts: fixture.contracts,
            content: structuredClone(fixture.desktopInitial),
          },
          { installDocument: true, count: fixture.counts.initial }
        );
        ContentDocumentBlocks.commit(initial, fixture.contentId, {
          documentId: fixture.documentId,
          expectedRevision: saved.revision,
          contracts: fixture.contracts,
          blocks: structuredClone(fixture.desktopInitial),
          order: fixture.desktopInitial.map(node => String(node.collabId)),
          count: nodes => getContentLength(nodes as never),
          countRules: "roundtrip-v1",
        });
        assertMain(initial, fixture, fixture.desktopInitial, fixture.counts.initial, 3);
        expect(
          initial.prepare("SELECT content FROM contents WHERE id=?").get(fixture.contentId)
        ).toEqual({ content: null });
        expect(
          initial.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()
        ).toEqual([
          { id: 21, ref_count: 1 },
          { id: 22, ref_count: 0 },
        ]);
        if (shared) {
          assertDataTables(initial, false);
          initial
            .prepare(
              "INSERT INTO collaboration_bindings VALUES (?, ?, ?, ?, 'article', ?, '保留文章标题')"
            )
            .run(
              fixture.contentId,
              fixture.createdAt,
              sharedFixture.binding.serverUrl,
              sharedFixture.binding.documentId,
              fixture.articleId
            );
        }
        initial.close();

        const started = performance.now();
        const rust = await execute(
          "cargo",
          [
            "test",
            "--offline",
            "--locked",
            "--manifest-path",
            join(root, "apps/mobile/src-tauri/Cargo.toml"),
            "--lib",
            shared
              ? "database::collaboration::tests::desktop_shared_projection_roundtrip"
              : "database::content_contracts::tests::desktop_block_storage_roundtrip",
            "--",
            "--ignored",
            "--exact",
            "--nocapture",
          ],
          {
            cwd: root,
            timeout: 300_000,
            maxBuffer: 4 * 1024 * 1024,
            env: { ...process.env, TAU_CONTENT_STORAGE_ROUNDTRIP_DB: path },
          }
        );
        const rustElapsedMs = Math.round(performance.now() - started);
        expect(rust.stdout).toContain("TAU_CONTENT_STORAGE_ROUNDTRIP_RUST_OK");
        expect(rust.stdout).toMatch(/test result: ok\. 1 passed; 0 failed/);

        const returned = new Database(path);
        cleanup.push(() => returned.open && returned.close());
        assertMain(returned, fixture, fixture.mobileExpected, fixture.counts.mobile, 2);
        for (const table of [
          "content_document_blocks",
          "content_document_node_blocks",
          "content_document_block_counts",
        ])
          expect(
            returned
              .prepare(`SELECT count(*) AS count FROM ${table} WHERE content_id=?`)
              .get(fixture.contentId)
          ).toEqual({ count: 0 });
        expect(
          returned.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()
        ).toEqual([
          { id: 21, ref_count: 0 },
          { id: 22, ref_count: 1 },
        ]);
        expect(
          returned.prepare("SELECT content_id FROM white_board_content_pending_releases").all()
        ).toEqual([{ content_id: 21 }]);
        const entities = [
          {
            node_id: "roundtrip-board",
            source_id: fixture.sourceId,
            entity_kind: "whiteboard-content",
            entity_id: "roundtrip-board-22",
          },
        ];
        if (shared)
          entities.push({
            node_id: "roundtrip-database",
            source_id: fixture.sourceId,
            entity_kind: "data-table",
            entity_id: "roundtrip-database-32",
          });
        const readEntities = () =>
          returned
            .prepare(
              "SELECT node_id,source_id,entity_kind,entity_id FROM content_entity_relations ORDER BY entity_kind DESC"
            )
            .all();
        expect(readEntities()).toEqual(entities);
        expect(
          returned.prepare("SELECT tags,content_id FROM cards WHERE id=?").get(fixture.cardId)
        ).toEqual({ tags: '["保留卡片标签"]', content_id: fixture.contentId });
        expect(
          returned
            .prepare("SELECT title,tags,content_id FROM articles WHERE id=?")
            .get(fixture.articleId)
        ).toEqual({
          title: "保留文章标题",
          tags: '["保留文章标签"]',
          content_id: fixture.contentId,
        });
        const mobile = ContentDocumentTable.read(returned, fixture.contentId);
        if (!mobile) throw new Error("移动写回后正文不存在");
        expect(mobile.content).toEqual(fixture.mobileExpected);
        const blocks = {
          documentId: fixture.documentId,
          expectedRevision: mobile.revision,
          contracts: fixture.contracts,
          blocks: [structuredClone(fixture.desktopExpected[0])],
          count: (nodes: ContentNode[]) => getContentLength(nodes as never),
          countRules: "roundtrip-v1",
        };
        if (shared) {
          assertDataTables(returned, true);
          const { documentId, serverUrl } = sharedFixture.binding;
          const source = restoreContentBinding(
            returned,
            sharedFixture.databaseName,
            documentId,
            serverUrl
          );
          expect(source).toMatchObject({
            contentId: fixture.contentId,
            contentCreatedAt: fixture.createdAt,
            librarySourceId: fixture.sourceId,
            contentDocumentId: fixture.documentId,
            projectionRevision: mobile.revision,
            sourceType: "article",
            sourceId: fixture.articleId,
          });
          if (!source) throw new Error("移动写回后协作绑定不存在");
          const projection = new SqliteContentProjection(returned, source, {
            id: documentId,
            serverUrl,
            mode: "shared",
          });
          expect(projection.readHead().formatVersion).toBe(2);
          expect(() =>
            projection.commit({ kind: "blocks", ...blocks, expectedRevision: "失效修订" })
          ).toThrow(/修订/);
          expect(projection.commit({ kind: "blocks", ...blocks }).changed).toBe(true);
          assertDataTables(returned, true);
        } else ContentDocumentBlocks.commit(returned, fixture.contentId, blocks);
        assertMain(returned, fixture, fixture.desktopExpected, fixture.counts.desktop, 3);
        expect(readEntities()).toEqual(entities);
        expect(
          returned.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()
        ).toEqual([
          { id: 21, ref_count: 0 },
          { id: 22, ref_count: 1 },
        ]);
        const report = {
          status: "passed",
          fixtureVersion: fixture.fixtureVersion,
          fixtureSha256: createHash("sha256").update(baselineBytes).digest("hex"),
          ...(shared
            ? {
                extensionSha256: createHash("sha256").update(sharedBytes).digest("hex"),
                stableSharedBinding: true,
                nativeWriteGuardsAndRollback: true,
                tableAndRowHolders: true,
              }
            : {}),
          node: process.version,
          rustElapsedMs,
          layouts: [3, 2, 3],
          rustSummary: rust.stdout.split("\n").filter(line => line.startsWith("test result:")),
        };
        console.info("[content-storage-roundtrip]", JSON.stringify(report));
        if (process.env.TAU_CONTENT_ROUNDTRIP_REPORT) {
          const path = shared
            ? `${process.env.TAU_CONTENT_ROUNDTRIP_REPORT}.shared.json`
            : process.env.TAU_CONTENT_ROUNDTRIP_REPORT;
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
        }
      },
      330_000
    );
  }
);
