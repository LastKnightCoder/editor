import Database from "better-sqlite3";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createSharedDocument, getBody, readSharedContent } from "@tau/collaboration";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import {
  registerContentSession,
  unregisterContentSession,
} from "../../collaboration/content-sessions";
import type { RuntimeSession } from "../../collaboration/types";
import { TaskAssistantEngine, readTask } from "../engine";
import { readTaskContent, taskNode } from "../../content-task-patches";

const dispose: Array<() => void> = [];
afterEach(() => {
  for (const run of dispose.splice(0).reverse()) run();
});
function fixture() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  dispose.push(() => db.close());
  const content = [
    { type: "paragraph", children: [{ text: "不改这一段", bold: true }] },
    {
      type: "check-list",
      children: [
        {
          type: "check-list-item",
          taskId: "task",
          checked: false,
          children: [
            {
              type: "paragraph",
              children: [
                { text: "写", bold: true },
                { text: "方案", italic: true },
              ],
            },
          ],
        },
      ],
    },
  ];
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(1,100,100,?,1)"
  ).run(JSON.stringify(content));
  db.prepare(
    "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('正文',1,100,100)"
  ).run();
  const doc = createSharedDocument(
    { title: "正文", content: content as never, bannerBg: "", bannerPosition: "center" },
    undefined,
    "local"
  );
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const persisted: Uint8Array[] = [];
  const session: RuntimeSession = {
    doc,
    awareness,
    privateNodes: new Map(),
    viewActiveTabs: new Map(),
    dirty: false,
    persistTaskChanges: () => persisted.push(Y.encodeStateAsUpdate(doc)),
    info: {
      id: "task-test",
      mode: "local",
      title: "正文",
      ownerId: "device",
      role: "owner",
      status: "active",
      members: [],
      updatedAt: 1,
      serverUrl: "",
      connection: "connected",
      pending: false,
      leaving: false,
      source: { databaseName: "test", contentId: 1, contentCreatedAt: 100 },
    },
  };
  registerContentSession(db, 1, session);
  dispose.push(() => {
    unregisterContentSession(session);
    awareness.destroy();
    doc.destroy();
  });
  return {
    db,
    session,
    persisted,
    ref: { kind: "document" as const, contentId: 1, createdAt: 100, taskId: "task" },
    engine: new TaskAssistantEngine(db),
  };
}

describe("正文助理持久化", () => {
  it("只改任务文字，保留其他节点和格式，持久化中包含回执", () => {
    const { db, session, persisted, ref, engine } = fixture();
    const untouched = getBody(session.doc).toDelta()[0].insert;
    const task = readTask(db, ref);
    const result = engine.execute(
      "update_todo",
      {
        requestId: "rename",
        taskRef: ref,
        revision: task.revision,
        patch: { title: "写方案草稿" },
      },
      "b"
    );
    expect(result.status).toBe("succeeded");
    expect(getBody(session.doc).toDelta()[0].insert).toBe(untouched);
    expect(readTask(db, ref).title).toBe("写方案草稿");
    expect(taskNode(readTaskContent(db, 1, 100), "task")!.children![0].children![0]).toMatchObject({
      text: "写",
      bold: true,
    });
    const restored = new Y.Doc();
    Y.applyUpdate(restored, persisted.at(-1)!);
    expect(restored.getMap("task-operation-receipts").has(result.operationId!)).toBe(true);
    restored.destroy();
  });
  it("落盘失败不返回成功，恢复后不会再次修改正文", () => {
    const { db, session, ref, engine } = fixture();
    const persist = session.persistTaskChanges!;
    session.persistTaskChanges = () => {
      throw new Error("磁盘写入失败");
    };
    const task = readTask(db, ref);
    const result = engine.execute(
      "update_todo",
      { requestId: "retry", taskRef: ref, revision: task.revision, patch: { title: "只改一次" } },
      "b"
    );
    expect(result.status).toBe("pending");
    session.persistTaskChanges = persist;
    engine.recoverPending();
    expect(
      db.prepare("SELECT status FROM task_assistant_operation WHERE id=?").get(result.operationId)
    ).toEqual({ status: "succeeded" });
    expect(readTask(db, ref).title).toBe("只改一次");
    expect(readSharedContent(session.doc).content).toHaveLength(2);
  });
});
