import { app, BrowserWindow, ipcMain } from "electron";
import { writeFileSync } from "node:fs";
import * as Y from "yjs";
import { captureScopedTextEdit, NodeTree, readNodeDocument } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { ContentDocumentTable } from "../../src-electron/main/modules/tables/content-document";
import { ContentIdentityTable } from "../../src-electron/main/modules/tables/content-identity";
import { CollaborationLocalStore } from "../../src-electron/main/modules/collaboration/local-store";
import { ContentSuggestionStore } from "../../src-electron/main/modules/collaboration/content-suggestions";
import { registerAgentEditExecution } from "../../src-electron/main/modules/agent-run-events";
import { join } from "node:path";
import database from "./database";
import ContentTable from "./content-table";
import localContent from "../../src-electron/main/modules/content-runtime";
import manager from "../../src-electron/main/modules/collaboration";
import { contentSession } from "../../src-electron/main/modules/collaboration/content-sessions";

app.setPath("userData", join(process.env.TAU_COLLAB_E2E_DIR!, "electron"));
app.commandLine.appendSwitch("use-mock-keychain");
const workspace = process.env.TAU_COLLAB_E2E_WORKSPACE ?? "primary";
const fixture = ["甲段旧文保留", "乙段旧文保留", "丙段人工保留"];
async function seedDocuments() {
  const { id, contract } = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  for (const [name, db] of database.databases) {
    if (ContentDocumentTable.read(db, 7)) continue;
    ContentIdentityTable.establishBaseline(db);
    const paragraphs =
      name === "coedit" ? fixture : [name === "primary" ? "同步测试正文" : "另一个数据库"];
    ContentDocumentTable.commit(
      db,
      7,
      {
        documentId: `fixture-${name}`,
        contracts: { [id]: contract },
        content: paragraphs.map((text, index) => ({
          type: "paragraph",
          collabId: `p${index + 1}`,
          tauContract: id,
          children: [{ type: "formatted", text }],
        })),
      },
      { installDocument: true, count: paragraphs.join("").length }
    );
  }
}
type CrashPoint =
  | "after-delta"
  | "after-receipt"
  | "before-suggestion-settle"
  | "after-chunk-commit";
let armed: { point: CrashPoint; document: string } | undefined;
function crash(point: CrashPoint) {
  if (armed?.point !== point) return;
  writeFileSync(join(process.env.TAU_COLLAB_E2E_DIR!, "crash-point"), point);
  process.kill(process.pid, "SIGKILL");
}
let revokeAfterAppend: (() => void) | undefined;
const append = CollaborationLocalStore.prototype.append;
CollaborationLocalStore.prototype.append = function (id, delta) {
  append.call(this, id, delta);
  if (id === armed?.document) crash("after-delta");
  if (revokeAfterAppend) {
    const revoke = revokeAfterAppend;
    revokeAfterAppend = undefined;
    queueMicrotask(revoke);
  }
};
const set = CollaborationLocalStore.prototype.set;
CollaborationLocalStore.prototype.set = function (key, value) {
  set.call(this, key, value);
  if (key.startsWith("scoped-edit:")) {
    crash("after-receipt");
    if (key.endsWith(".t0") && armed?.point === "after-chunk-commit")
      queueMicrotask(() => crash("after-chunk-commit"));
  }
};
const settle = ContentSuggestionStore.prototype.settle;
ContentSuggestionStore.prototype.settle = function (...args) {
  if (args[1] === "accepted") crash("before-suggestion-settle");
  return settle.apply(this, args);
};
async function boot() {
  await app.whenReady();
  await seedDocuments();
  await localContent.init();
  await manager.init();
  const open = async (databaseName = "primary") => {
    const window = new BrowserWindow({
      width: 1180,
      height: 820,
      show: true,
      webPreferences: {
        preload: process.env.TAU_COLLAB_E2E_PRELOAD,
        contextIsolation: true,
        sandbox: false,
      },
    });
    database.windowToDatabase.set(window.id, databaseName);
    await window.loadURL(
      `${process.env.TAU_COLLAB_E2E_URL}/e2e/collaboration/index.html?databaseName=${databaseName}`
    );
    return window.id;
  };
  const coeditDb = database.getDatabase("coedit")!;
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  ipcMain.handle("entity:locate", () => null);
  ipcMain.handle("notification:dismiss", () => undefined);
  ipcMain.handle("content:suggestions", (_event, query) =>
    manager.suggestions.list(coeditDb, query)
  );
  let competing: { id: string; ready: Promise<void>; arrived(): void } | undefined;
  ipcMain.handle("e2e:arm-competing-suggestion-actions", (_event, id: string) => {
    let arrived = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      let count = 0;
      const timer = setTimeout(() => {
        competing = undefined;
        reject(new Error("两个窗口未同时发出建议操作"));
      }, 5000);
      arrived = () => {
        if (++count < 2) return;
        clearTimeout(timer);
        competing = undefined;
        resolve();
      };
    });
    void ready.catch(() => undefined);
    competing = { id, ready, arrived };
  });
  // 两边都要从真实按钮发出 IPC，避免先完成的一侧让另一窗口提前移除按钮。
  const waitForCompetingAction = async (ids: string[]) => {
    const pending = competing;
    if (!pending || !ids.includes(pending.id)) return;
    pending.arrived();
    await pending.ready;
  };
  ipcMain.handle("content:suggestions-accept", async (_event, id, ids, options) => {
    await waitForCompetingAction(ids);
    return manager.suggestions.accept(coeditDb, id, ids, options);
  });
  ipcMain.handle("content:suggestions-reject", async (_event, id, ids, feedback) => {
    await waitForCompetingAction(ids);
    return manager.suggestions.reject(coeditDb, id, ids, feedback);
  });
  ipcMain.handle("content:suggestions-undo", async (_event, id, ids) => {
    await waitForCompetingAction(ids);
    return manager.suggestions.undo(coeditDb, id, ids);
  });
  ipcMain.handle("content:agent-permissions", (_event, id) =>
    manager.agentPermissions.list(coeditDb, id)
  );
  ipcMain.handle("content:agent-permission-set", (_event, id, agent, level) =>
    manager.agentPermissions.set(coeditDb, id, agent, level)
  );
  ipcMain.handle(
    "e2e:stage",
    async (
      _event,
      spec: {
        proposalId: string;
        blockId: string;
        before: string;
        text: string;
        agent: string;
        direct?: boolean;
      }
    ) => {
      const snapshot = await manager.readEditSnapshot(coeditDb, 7);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, snapshot.state);
      const tree = new NodeTree(doc);
      try {
        const text = tree
          .spans(spec.blockId)
          .map(span => span.value)
          .join("");
        const start = text.indexOf(spec.before);
        if (start < 0 || text.lastIndexOf(spec.before) !== start) throw new Error("验收原文不唯一");
        return manager.suggestions.create(coeditDb, 7, {
          proposalId: spec.proposalId,
          conversationKey: spec.agent,
          agentId: spec.agent,
          agentLabel: spec.agent,
          mode: spec.direct ? "direct" : "suggest",
          baseline: snapshot.identity,
          items: [
            {
              edit: captureScopedTextEdit(
                tree,
                "edit",
                spec.blockId,
                start,
                start + spec.before.length,
                spec.text
              ),
              beforeText: spec.before,
              afterText: spec.text,
            },
          ],
        })[0];
      } finally {
        tree.dispose();
        doc.destroy();
      }
    }
  );
  ipcMain.handle("e2e:run-agent", async (_event, id: string, execution: string) => {
    const finish = registerAgentEditExecution(execution);
    try {
      return await manager.suggestions.accept(coeditDb, 7, [id], {
        typing: true,
        executionId: execution,
        requireDirectPermission: true,
      });
    } finally {
      finish();
    }
  });
  ipcMain.handle("e2e:share", event => manager["createContent"](event, 7, "article", 1));
  ipcMain.handle("e2e:revoke-on-append", (_event, agent: string) => {
    revokeAfterAppend = () => manager.agentPermissions.set(coeditDb, 7, agent, "readonly");
  });
  ipcMain.handle("e2e:arm-crash", (_event, point: CrashPoint) => {
    const session = contentSession(coeditDb, 7);
    if (!session) throw new Error("验收正文尚未打开");
    armed = { point, document: session.info.id };
  });
  ipcMain.handle("e2e:decode-body", (_event, state: string) => {
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(state, "base64"));
      return readNodeDocument(doc).content.map(
        block => block.children?.map(leaf => leaf.text).join("") ?? ""
      );
    } finally {
      doc.destroy();
    }
  });
  ipcMain.handle("e2e:coedit-state", () => {
    const session = contentSession(coeditDb, 7);
    if (!session) return null;
    const store = session.store!;
    const receipts = store.db
      .prepare("SELECT key,value FROM settings WHERE key LIKE 'scoped-edit:%' ORDER BY key")
      .all() as { key: string; value: string }[];
    return {
      documentId: session.info.id,
      content: readNodeDocument(session.doc).content,
      receipts: receipts.map(row => ({ key: row.key, ...JSON.parse(row.value) })),
    };
  });
  ipcMain.handle("e2e:open-window", (_event, name: string) => open(name));
  ipcMain.handle("e2e:quit", () => {
    setTimeout(() => app.quit(), 0);
    return true;
  });
  ipcMain.handle("e2e:database", event => {
    const window = BrowserWindow.fromWebContents(event.sender)!;
    const db = database.getDatabase(database.windowToDatabase.get(window.id)!)!;
    return {
      content: ContentTable.getContentById(db, 7),
      sessionTitle: contentSession(db, 7)?.doc.getText("title").toString(),
      frozen: contentSession(db, 7)?.info.frozen,
      titles: [
        ["articles", 1],
        ["project_item", 2],
        ["project_item", 3],
      ].map(
        ([table, id]) =>
          (db.prepare(`SELECT title FROM ${table} WHERE id=?`).get(id) as { title: string }).title
      ),
    };
  });
  ipcMain.handle("content:get-by-id", (event, id: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)!;
    return ContentTable.getContentById(
      database.getDatabase(database.windowToDatabase.get(window.id)!)!,
      id
    );
  });
  ipcMain.handle("get-platform", () => process.platform);
  ipcMain.handle("get-home-dir", () => process.env.TAU_COLLAB_E2E_DIR);
  ipcMain.handle("get-editor-dir", () => process.env.TAU_COLLAB_E2E_DIR);
  await open(workspace);
}
void boot();
