// @vitest-environment node
import { expect, it } from "vitest";
import Database from "better-sqlite3";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import {
  NodeTree,
  readNodeDocument,
  readDocumentHistoryPreview,
  buildDocumentHistoryUpdate,
} from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { createHash } from "node:crypto";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { CollaborationLocalStore } from "../collaboration/local-store";
import { captureLibraryHistory, LibraryHistory } from "./library-history";

const historyRevision = (state: Uint8Array) => createHash("sha256").update(state).digest("hex");

it("两台电脑的旧历史在换库、旧客户端往返和写入中断后逐版还原", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tau-history-sync-"));
  const a = new CollaborationLocalStore(join(dir, "a")),
    b = new CollaborationLocalStore(join(dir, "b"));
  const path = join(dir, "library.db"),
    blank = join(dir, "old.db");
  let db = new Database(path);
  const id = "article",
    scope = JSON.stringify(["library", id]);
  const documents: Y.Doc[] = [];
  const expected = new Map<string, string>();
  const text = (doc: Y.Doc) =>
    readNodeDocument(doc)
      .content[0].children?.map(n => n.text)
      .join("");
  try {
    db.exec(schema);
    db.exec(
      "INSERT INTO library_identity(id,source_id,baseline_id,create_time) VALUES(1,'library','original',0); INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1,1,'[]',0,1); INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(1,'article',3,'{}','body');"
    );
    db.pragma("wal_checkpoint(TRUNCATE)");
    copyFileSync(path, blank);
    // Model the pre-upgrade database which never carried the portable table.
    const old = new Database(blank);
    old.exec("DROP TABLE content_history_versions");
    old.close();
    const initial = "甲乙";
    for (const [name, store] of [
      ["A", a],
      ["B", b],
    ] as const) {
      const doc = await createTestDocument(
        {
          title: "文章",
          bannerBg: "",
          bannerPosition: "center",
          content: [{ type: "paragraph", collabId: "p", children: [{ text: initial }] }],
        },
        { documentId: id, baselineId: name, epoch: 0 }
      );
      documents.push(doc);
      const tree = new NodeTree(doc);
      let written = initial;
      const count = process.env.TAU_HISTORY_SYNC_STRESS === "1" ? 160 : 4;
      for (let i = 0; i < count; i++) {
        const operationId = name + "-" + i,
          mark = "[" + operationId + "]";
        const before = Y.encodeStateAsUpdate(doc),
          vector = Y.encodeStateVector(doc);
        tree.insertText("p", written.length, mark, null);
        written += mark;
        const after = Y.encodeStateAsUpdate(doc);
        store.history.append(scope, {
          operationId,
          actor: { actorId: "local", actorName: "本机" },
          previousRevision: historyRevision(before),
          revision: historyRevision(after),
          before: () => before,
          after: () => after,
          update: Y.encodeStateAsUpdate(doc, vector),
          mergeable: false,
        });
        expected.set(operationId, written);
      }
      tree.dispose();
    }
    captureLibraryHistory(db, a);
    const beforeRows = db.prepare("SELECT count(*) AS n FROM content_history_versions").get();
    db.exec(
      "CREATE TRIGGER fail_import BEFORE INSERT ON content_history_versions WHEN NEW.version_key='op:B-2' BEGIN SELECT RAISE(ABORT,'disk fault'); END"
    );
    expect(() => captureLibraryHistory(db, b)).toThrow(/disk fault/);
    expect(db.prepare("SELECT count(*) AS n FROM content_history_versions").get()).toEqual(
      beforeRows
    );
    db.exec("DROP TRIGGER fail_import");
    captureLibraryHistory(db, b, undefined, true);
    // An old SQLite client may update the library while merely preserving unknown tables.
    db.close();
    db = new Database(path);
    db.prepare("UPDATE contents SET update_time=3 WHERE id=1").run();
    expect(
      db.prepare("SELECT revision FROM content_documents WHERE document_id=?").get(id)
    ).toEqual({ revision: "body" });
    db.close();
    copyFileSync(blank, path);
    db = new Database(path);
    db.exec(schema);
    captureLibraryHistory(db, b);
    captureLibraryHistory(db, a);
    captureLibraryHistory(db, b);
    if (process.env.TAU_HISTORY_SYNC_STRESS === "1") {
      for (let round = 0; round < 24; round++) {
        db.close();
        copyFileSync(blank, path);
        db = new Database(path);
        db.exec(schema);
        const key = (round % 2 ? "A-" : "B-") + ((round * 7) % 160);
        db.exec(
          `CREATE TRIGGER interrupt_restore BEFORE INSERT ON content_history_versions WHEN NEW.version_key='op:${key}' BEGIN SELECT RAISE(ABORT,'interrupted restore'); END`
        );
        expect(() => captureLibraryHistory(db, b)).toThrow(/interrupted restore/);
        expect(db.prepare("SELECT count(*) AS n FROM content_history_versions").get()).toEqual({
          n: 0,
        });
        db.exec("DROP TRIGGER interrupt_restore");
        captureLibraryHistory(db, b);
        captureLibraryHistory(db, a);
        const selected = db
          .prepare(
            "SELECT sequence FROM content_history_versions WHERE document_id=? AND version_key=?"
          )
          .get(id, "op:" + key) as { sequence: number };
        const version = new LibraryHistory(db).replay(id, selected.sequence);
        try {
          expect(text(version)).toBe(expected.get(key));
        } finally {
          version.destroy();
        }
        expect(db.pragma("quick_check", { simple: true })).toBe("ok");
        expect(db.pragma("foreign_key_check")).toEqual([]);
      }
    }
    const archive = new LibraryHistory(db);
    const rows = [];
    let before: number | undefined;
    for (;;) {
      const page = archive.list(id, before);
      if (!page.length) break;
      rows.push(...page);
      before = page.at(-1)?.sequence;
    }
    expect(rows.filter(r => r.kind === "edit")).toHaveLength(expected.size);
    expect(rows.filter(r => r.kind === "baseline")).toHaveLength(2);
    for (const entry of rows) {
      const doc = archive.replay(id, entry.sequence);
      try {
        expect(text(doc)).toBe(expected.get(entry.operationId) ?? initial);
      } finally {
        doc.destroy();
      }
    }
    const lastB = rows.find(r => r.operationId === "B-" + (expected.size / 2 - 1));
    if (!lastB) throw new Error("缺少最后一条记录");
    const preview = readDocumentHistoryPreview(archive, id, lastB.sequence, "", "local", true);
    expect(preview.changes.map(change => change.kind)).toEqual(["modify"]);
    const current = documents[1];
    await expect(
      buildDocumentHistoryUpdate(
        archive,
        id,
        current,
        {
          kind: "undo",
          sequence: lastB.sequence,
          operationId: "stale-preview",
          versionKey: "op:A-0",
        },
        "",
        "local",
        true
      )
    ).rejects.toMatchObject({ code: "CONTENT_VERSION_CONFLICT" });
    const undo = {
      kind: "undo" as const,
      sequence: lastB.sequence,
      operationId: "undo-on-other-device",
    };
    const delta = await buildDocumentHistoryUpdate(archive, id, current, undo, "", "local", true);
    Y.applyUpdate(current, delta);
    expect(text(current)).toBe(expected.get("B-" + (expected.size / 2 - 2)));
    const undoState = Y.encodeStateAsUpdate(current);
    const undoBefore = archive.replay(id, lastB.sequence);
    try {
      const before = Y.encodeStateAsUpdate(undoBefore);
      b.history.append(scope, {
        operationId: undo.operationId,
        actor: { actorId: "local", actorName: "本机" },
        kind: "undo",
        targetVersion: archive.versionKey(id, lastB.sequence),
        previousRevision: historyRevision(before),
        revision: historyRevision(undoState),
        before: () => before,
        after: () => undoState,
        update: delta,
      });
    } finally {
      undoBefore.destroy();
    }
    captureLibraryHistory(db, b, id);
    expect(archive.undone(id, lastB.sequence)).toBe(true);
    const undoEntry = archive.list(id).find(entry => entry.operationId === undo.operationId);
    if (!undoEntry) throw new Error("撤销记录未保存");
    expect(undoEntry.target).toBe(lastB.sequence);
    Y.applyUpdate(
      current,
      await buildDocumentHistoryUpdate(
        archive,
        id,
        current,
        {
          kind: "undo",
          sequence: undoEntry.sequence,
          operationId: "redo-from-library",
        },
        "",
        "local",
        true
      )
    );
    expect(text(current)).toBe(expected.get(lastB.operationId));
    // Optional native interop run uses the same two real files in both directions.
    const exchange = process.env.TAU_HISTORY_EXCHANGE;
    if (exchange) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      copyFileSync(path, join(exchange, "library.db"));
      const mobile = await createTestDocument(
        {
          title: "手机",
          bannerBg: "",
          bannerPosition: "center",
          content: [{ type: "paragraph", collabId: "p", children: [{ text: initial }] }],
        },
        { documentId: id, baselineId: "mobile-session", epoch: 0 }
      );
      const tree = new NodeTree(mobile);
      const updates = [Buffer.from(Y.encodeStateAsUpdate(mobile)).toString("base64")];
      for (const value of ["甲", "乙", "丙"]) {
        const vector = Y.encodeStateVector(mobile);
        tree.insertText("p", 0, value, null);
        updates.push(Buffer.from(Y.encodeStateAsUpdate(mobile, vector)).toString("base64"));
      }
      writeFileSync(join(exchange, "updates.json"), JSON.stringify(updates));
      tree.dispose();
      mobile.destroy();
    }
  } finally {
    for (const doc of documents) doc.destroy();
    db.close();
    a.db.close();
    b.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

it.runIf(!!process.env.TAU_HISTORY_READ_MOBILE)(
  "手机导出的版本在桌面逐条回放且撤销指向正确版本",
  () => {
    const folder = process.env.TAU_HISTORY_READ_MOBILE;
    if (!folder) throw new Error("缺少移动交换目录");
    const db = new Database(join(folder, "library.db"));
    try {
      const archive = new LibraryHistory(db);
      const rows = archive
        .list("article")
        .filter(row => row.operationId.startsWith("phone-"))
        .reverse();
      expect(rows.map(row => row.operationId)).toEqual(["phone-1", "phone-2", "phone-3"]);
      const expected = ["甲甲乙", "乙甲甲乙", "丙乙甲甲乙"];
      for (const [i, row] of rows.entries()) {
        const doc = archive.replay("article", row.sequence);
        try {
          expect(readNodeDocument(doc).content[0].children?.[0].text).toBe(expected[i]);
        } finally {
          doc.destroy();
        }
      }
      const receipt = JSON.parse(readFileSync(join(folder, "receipt.json"), "utf8"));
      expect(receipt.desktopVersions).toBeGreaterThan(2);
      const desktopDoc = new Y.Doc({ gc: false });
      try {
        for (const raw of receipt.desktopUpdates)
          Y.applyUpdate(desktopDoc, Buffer.from(raw, "base64"));
        expect(readNodeDocument(desktopDoc).content[0].children?.[0].text).toBe("甲乙[A-0]");
      } finally {
        desktopDoc.destroy();
      }
    } finally {
      db.close();
    }
  }
);

it("跨分片的基线可以回放，浏览列表继续合并，预览和上传固定的版本保持原文", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-history-parts-"));
  const store = new CollaborationLocalStore(directory);
  const db = new Database(":memory:");
  const initial = "段落🙂".repeat(70000);
  const id = "large-text",
    scope = JSON.stringify(["large-library", id]);
  const doc = await createTestDocument(
    {
      title: "长正文",
      bannerBg: "",
      bannerPosition: "center",
      content: [{ type: "paragraph", collabId: "p", children: [{ text: initial }] }],
    },
    { documentId: id, baselineId: "history", epoch: 0 }
  );
  const tree = new NodeTree(doc);
  try {
    db.exec(schema);
    db.exec(
      "INSERT INTO library_identity(id,source_id,baseline_id,create_time) VALUES(1,'large-library','original',0); INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1,1,'[]',0,1); INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(1,'large-text',3,'{}','head')"
    );
    const edit = (name: string) => {
      const before = Y.encodeStateAsUpdate(doc),
        vec = Y.encodeStateVector(doc);
      tree.insertText("p", 0, name, null);
      const after = Y.encodeStateAsUpdate(doc);
      store.history.append(scope, {
        operationId: name,
        actor: { actorId: "local", actorName: "本机" },
        previousRevision: historyRevision(before),
        revision: historyRevision(after),
        before: () => before,
        after: () => after,
        update: Y.encodeStateAsUpdate(doc, vec),
      });
    };
    const archive = new LibraryHistory(db);
    edit("a");
    const forkPath = join(directory, "offline-copy.db");
    await store.db.backup(forkPath);
    const forkState = Y.encodeStateAsUpdate(doc);
    captureLibraryHistory(db, store, id);
    edit("b");
    captureLibraryHistory(db, store, id);
    const fixed = archive.list(id)[0];
    expect(archive.list(id).map(row => row.kind)).toEqual(["edit", "baseline"]);
    expect(fixed.operationId).toBe("b");
    captureLibraryHistory(db, store, id, false, fixed.sequence);
    edit("c");
    captureLibraryHistory(db, store);
    for (const [seq, value] of [
      [0, initial],
      [fixed.sequence, "ba" + initial],
      [archive.list(id)[0].sequence, "cba" + initial],
    ] as const) {
      const old = archive.replay(id, seq);
      try {
        expect(readNodeDocument(old).content[0].children?.[0].text).toBe(value);
      } finally {
        old.destroy();
      }
    }
    expect(db.pragma("foreign_key_check")).toEqual([]);
    const offline = new CollaborationLocalStore(directory, "offline-copy.db");
    const fork = new Y.Doc({ gc: false });
    const offlineTree = new NodeTree(fork);
    try {
      Y.applyUpdate(fork, forkState);
      const vector = Y.encodeStateVector(fork);
      offlineTree.insertText("p", 0, "x", null);
      const after = Y.encodeStateAsUpdate(fork);
      offline.history.append(scope, {
        operationId: "offline-x",
        actor: { actorId: "local", actorName: "本机" },
        previousRevision: historyRevision(forkState),
        revision: historyRevision(after),
        update: Y.encodeStateAsUpdate(fork, vector),
        before: () => forkState,
        after: () => after,
        mergeable: false,
      });
      captureLibraryHistory(db, offline);
      captureLibraryHistory(db, offline);
      const branch = archive.list(id).find(row => row.operationId === "offline-x");
      if (!branch) throw new Error("旧端分支未导入");
      for (const [seq, expected] of [
        [branch.sequence, "xa" + initial],
        [fixed.sequence, "ba" + initial],
      ] as const) {
        const copy = archive.replay(id, seq);
        try {
          expect(readNodeDocument(copy).content[0].children?.[0].text).toBe(expected);
        } finally {
          copy.destroy();
        }
      }
    } finally {
      offlineTree.dispose();
      fork.destroy();
      offline.db.close();
    }
    // Two libraries may legitimately contain the same document identifier.
    db.prepare("UPDATE library_identity SET source_id='other-library'").run();
    db.exec("DELETE FROM content_history_versions");
    captureLibraryHistory(db, store);
    expect(archive.list(id)).toEqual([]);
  } finally {
    tree.dispose();
    doc.destroy();
    db.close();
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
