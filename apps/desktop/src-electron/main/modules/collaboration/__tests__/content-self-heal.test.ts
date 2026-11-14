/** 打开正文时的自愈：主库里缺身份、缺契约或旧格式的正文备份原文后修复落库，而不是拒绝打开。 */
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import schema from "@tau/db-schema/schema/main.sql?raw";
import agentSchema from "@tau/db-schema/schema/content-agent.sql?raw";
import type { IpcMainInvokeEvent } from "electron";
import { ContentSessionManager } from "../../content-runtime";
import { CollaborationLocalStore } from "../local-store";
import { ContentLocalState } from "../content-local-state";
import { CollaborationAssetService } from "../asset-service";
import type { RuntimeSession } from "../types";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import { unregisterContentSession } from "../content-sessions";

const host = vi.hoisted(() => ({
  dir: "",
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map([[1, "library"]]),
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({ id: 1 }) },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../../database", () => ({
  default: { ...host, getDatabase: (name: string) => host.databases.get(name) },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => host.dir } }));
vi.mock("../../../services/content-execution", () => ({
  contentExecutor: {
    // 修复在真实内容转换运行时里执行（与生产同一份 content-runtime）
    execute: async (
      request: import("../../../../../shared/content-execution").ContentExecutionRequest
    ) => {
      const { default: extensions } = await import("@/stores/useDynamicExtensionsStore");
      await extensions.getState().initExtensions();
      await import("@/app/plugins/content-runtime");
      return (
        globalThis as unknown as { tauContentExecute(input: unknown): Promise<unknown> }
      ).tauContentExecute({ hash: "unit-fixtures", artifacts: [], request });
    },
  },
}));

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const run of cleanup.splice(0).reverse()) await run();
  host.databases.clear();
});
async function setup() {
  const root = mkdtempSync(join(tmpdir(), "tau-manager-flow-"));
  host.dir = root;
  const db = new Database(join(root, "library.db"));
  db.exec(schema);
  host.databases.set("library", db);
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (7,1,1,?,2,1)"
  ).run(
    JSON.stringify([
      { type: "paragraph", svg: "用户业务内容", isFold: true, children: [{ text: "正文" }] },
    ])
  );
  const directory = join(root, "local-content");
  const store = new CollaborationLocalStore(directory, "content.db");
  store.db.exec(agentSchema);
  const sessions = new Map<string, RuntimeSession>();
  const runtime = Object.assign(new ContentSessionManager(), {
    store,
    contentState: new ContentLocalState(store.db),
    directory,
    sessions,
    assets: new CollaborationAssetService(store, root, async () => {
      throw new Error("本机正文无需远端身份");
    }),
  });
  cleanup.push(() => {
    runtime.shutdown();
    for (const session of sessions.values()) {
      unregisterContentSession(session);
      session.awareness.destroy();
      session.doc.destroy();
    }
    store.db.close();
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const event = { sender: {} } as IpcMainInvokeEvent;
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  ContentIdentityTable.establishBaseline(db);
  ContentDocumentTable.commit(
    db,
    7,
    {
      documentId: "test-content",
      contracts: { [paragraph.id]: paragraph.contract },
      content: [
        {
          type: "paragraph",
          collabId: "paragraph",
          tauContract: paragraph.id,
          svg: "用户业务内容",
          isFold: true,
          children: [{ text: "正文" }],
        },
      ],
    },
    { installDocument: true, count: 2 }
  );
  await runtime.open(event, { contentId: 7 });
  return { runtime, db, event };
}

describe("打开时自愈", () => {
  const text = (value: string) => ({ type: "formatted", text: value });
  const shapes: Record<string, (paragraph: string) => unknown[]> = {
    旧格式正文: () => [{ type: "paragraph", children: [{ text: "x" }] }],
    缺契约: () => [{ type: "paragraph", collabId: "a", children: [text("x")] }],
    契约不在字典: () => [
      { type: "paragraph", collabId: "a", tauContract: "deadbeef", children: [text("x")] },
    ],
    重复身份: paragraph => [
      { type: "paragraph", collabId: "a", tauContract: paragraph, children: [text("x")] },
      { type: "paragraph", collabId: "a", tauContract: paragraph, children: [text("y")] },
    ],
    子节点缺身份: paragraph => [
      {
        type: "paragraph",
        collabId: "a",
        tauContract: paragraph,
        children: [
          text("见"),
          { type: "content-link", contentId: 2, contentType: "card", children: [text("卡片")] },
        ],
      },
    ],
  };
  for (const [name, shape] of Object.entries(shapes))
    it(`${name}：备份原文后修复落库，正常打开且文字不丢`, async () => {
      const { runtime, db, event } = await setup();
      const paragraph = Object.keys(ContentDocumentTable.read(db, 7)!.contracts)[0];
      const original = JSON.stringify(shape(paragraph));
      db.prepare(
        "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (8,2,2,?,3,1)"
      ).run(original);
      if (name !== "旧格式正文")
        db.prepare(
          "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (8,'doc-8',2,?,'r1')"
        ).run(JSON.stringify(ContentDocumentTable.read(db, 7)!.contracts));
      await expect(runtime.open(event, { contentId: 8 })).resolves.toBeTruthy();
      const stored = ContentDocumentTable.read(db, 8)!;
      expect(db.prepare("SELECT update_time FROM contents WHERE id=8").get()).toEqual({
        update_time: 2,
      });
      expect(
        db
          .prepare(
            "SELECT * FROM operation WHERE operation_content_type='content' AND operation_id=8"
          )
          .all()
      ).toHaveLength(0);
      expect(ContentDocumentTable.problem(stored.content, stored.contracts)).toBeNull();
      if (name !== "旧格式正文") expect(stored.documentId).toBe("doc-8");
      for (const word of JSON.stringify(shape(paragraph)).match(/"text":"([^"]+)"/g) ?? [])
        expect(JSON.stringify(stored.content)).toContain(word.replace(/"text":/, ""));
      const backups = readdirSync(join(host.dir, "content-repairs"));
      expect(backups).toHaveLength(1);
      expect(
        JSON.parse(readFileSync(join(host.dir, "content-repairs", backups[0]), "utf8")).content
      ).toBe(original);
    });

  it("文档记录格式版本较新（新版客户端写入）：拒绝打开，原数据不动、不备份", async () => {
    const { runtime, db, event } = await setup();
    const paragraph = Object.keys(ContentDocumentTable.read(db, 7)!.contracts)[0];
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (8,2,2,?,3,1)"
    ).run(
      JSON.stringify([
        { type: "paragraph", collabId: "a", tauContract: paragraph, children: [text("新格式")] },
      ])
    );
    db.prepare(
      "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (8,'doc-8',4,'{\"未来\":1}','r9')"
    ).run();
    await expect(runtime.open(event, { contentId: 8 })).rejects.toThrow("格式不兼容");
    expect(
      db
        .prepare(
          "SELECT format_version,contracts,revision FROM content_documents WHERE content_id=8"
        )
        .get()
    ).toEqual({ format_version: 4, contracts: '{"未来":1}', revision: "r9" });
    expect(existsSync(join(host.dir, "content-repairs"))).toBe(false);
  });

  it("合格正文打开不改写、不备份", async () => {
    const { runtime, db, event } = await setup();
    const before = ContentDocumentTable.read(db, 7)!;
    await runtime.open(event, { contentId: 7 });
    expect(ContentDocumentTable.read(db, 7)!.revision).toBe(before.revision);
    expect(existsSync(join(host.dir, "content-repairs"))).toBe(false);
  });
});
