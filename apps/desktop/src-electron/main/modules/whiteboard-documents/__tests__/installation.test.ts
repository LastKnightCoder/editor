// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "@tau/db-schema/schema/main.sql?raw";
import {
  WhiteboardModel,
  createWhiteboardBaseline,
  whiteboardPublicationScope,
} from "@tau/collaboration";
import { ContentIdentityTable } from "../../tables/content-identity";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { WhiteboardInstallation } from "../installation";
import { WhiteboardJournal, journalKey } from "../journal";
import { WhiteboardDocumentRepository } from "../repository";
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
  const migration = new WhiteboardInstallation(state, journal);
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
      expect(f.state.installation("operation")?.phase).toBe("COMPLETE");
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
    expect(f.state.installation("publish")?.decision).toBeDefined();
    expect(f.repo.read("local")?.epoch).toBe(0);
    f.db.exec("DROP TRIGGER fail_install");
    await f.transitions.resumePublication(f.db, "A", "publish");
    expect(f.state.installation("publish")?.phase).toBe("COMPLETE");
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
