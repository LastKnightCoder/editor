import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSharedDocument, type CollaborationSession } from "@tau/collaboration";
import {
  migrateContentBindings,
  restoreContentBinding,
  restorePrivateNodes,
  writeContentProjection,
} from "../../desktop/src-electron/main/modules/collaboration/content-repository";
import { CollaborationLocalStore } from "../../desktop/src-electron/main/modules/collaboration/local-store";
import { CollaborationAssetService } from "../../desktop/src-electron/main/modules/collaboration/asset-service";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
const temporary = () => {
  const dir = mkdtempSync(join(tmpdir(), "tau-content-test-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
function database() {
  const db = new Database(":memory:");
  cleanup.push(() => db.close());
  const schema = readFileSync(
    new URL("../../../packages/db-schema/schema/main.sql", import.meta.url),
    "utf8"
  );
  db.exec(schema);
  return db;
}

describe("通用内容和本地恢复", () => {
  it("恢复跨设备私有组件标识，并阻止不可识别的旧组件被占位符覆盖", () => {
    const db = database();
    const original = {
      type: "whiteboard",
      collabId: "private-block",
      whiteBoardContentId: 42,
      children: [{ text: "" }],
    };
    db.prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES (7,100,100,?)").run(
      JSON.stringify([original])
    );
    const source = { databaseName: "data", contentId: 7, contentCreatedAt: 100 };
    const restored = new Map();
    restorePrivateNodes(db, source, restored);
    expect(restored.get("private-block").whiteBoardContentId).toBe(42);
    db.prepare("UPDATE contents SET content=? WHERE id=7").run(
      JSON.stringify([{ ...original, collabId: undefined }])
    );
    expect(() => restorePrivateNodes(db, source, new Map())).toThrow("缺少本地组件关联标识");
  });
  it("迁移旧文章绑定，恢复任意 content 的关联并拒绝同号替换", () => {
    const db = database();
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content) VALUES (7,100,100,'[]')"
    ).run();
    db.prepare(
      "INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (5,'标题',200,200,7)"
    ).run();
    db.exec(
      "DROP TABLE collaboration_bindings; CREATE TABLE collaboration_bindings(content_id INTEGER PRIMARY KEY,article_id INTEGER,article_created_at INTEGER,server_url TEXT,document_id TEXT); INSERT INTO collaboration_bindings VALUES(7,5,200,'https://collab.example','doc');"
    );
    migrateContentBindings(db);
    const source = restoreContentBinding(db, "data", "doc", "https://collab.example");
    expect(source?.contentCreatedAt).toBe(100);
    expect(source?.contentId).toBe(7);
    if (!source) throw new Error("未恢复绑定");
    writeContentProjection(db, source, "doc", "https://collab.example", [{ text: "新内容" }], 3);
    db.prepare("UPDATE contents SET content='[]' WHERE id=7").run();
    expect(
      writeContentProjection(db, source, "doc", "https://collab.example", [{ text: "新内容" }], 3)
    ).toBe(true);
    db.prepare("UPDATE contents SET create_time=999 WHERE id=7").run();
    expect(() =>
      writeContentProjection(db, source, "doc", "https://collab.example", [], 0)
    ).toThrow("关联已变化");
  });

  it("本地缓存带版本，离线增量跨重启恢复，未知新版本不覆盖", () => {
    const directory = temporary();
    const store = new CollaborationLocalStore(directory);
    const doc = createSharedDocument({
      title: "初始",
      content: [{ text: "内容" }],
      bannerBg: "",
      bannerPosition: "center",
    });
    const session: CollaborationSession = {
      id: "offline",
      title: "初始",
      ownerId: "owner",
      role: "owner",
      status: "active",
      members: [],
      updatedAt: 1,
      serverUrl: "https://collab.example",
      connection: "offline",
      pending: true,
      leaving: false,
    };
    store.create(session, doc);
    doc.on("update", update => store.append(session.id, update));
    doc.getText("title").insert(0, "离线");
    store.db.close();
    doc.destroy();
    const restored = new CollaborationLocalStore(directory);
    const loaded = restored.load(session.id);
    expect(loaded.doc.getText("title").toString()).toBe("离线初始");
    loaded.doc.destroy();
    restored.db.pragma("user_version=2");
    restored.db.close();
    expect(() => new CollaborationLocalStore(directory)).toThrow("升级 Tau");
  });

  it("另存资源移动到独立资源目录，删除会话缓存后副本仍可读取", async () => {
    const directory = temporary(),
      cache = join(directory, "collaboration");
    const store = new CollaborationLocalStore(cache);
    cleanup.push(() => store.db.close());
    const assetId = "00000000-0000-4000-8000-000000000001",
      documentId = "session";
    const folder = join(cache, "assets", documentId);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "image.png");
    writeFileSync(file, "PNG-FIXTURE");
    store.db
      .prepare("INSERT INTO resources VALUES (?,?,?,?,?,1)")
      .run(assetId, documentId, "image.png", "image/png", file);
    const assets = new CollaborationAssetService(store, directory, async () => {
      throw new Error("缓存资源不应请求网络");
    });
    const value = await assets.localize("https://collab.example", documentId, {
      title: "副本",
      bannerBg: "",
      bannerPosition: "center",
      content: [{ type: "image", url: `tau-collab-asset:${assetId}`, children: [{ text: "" }] }],
    });
    store.remove(documentId);
    rmSync(folder, { recursive: true });
    const localPath = value.content[0].url as string;
    expect(existsSync(localPath)).toBe(true);
    expect(readFileSync(localPath, "utf8")).toBe("PNG-FIXTURE");
    expect(localPath).toContain(join("resources", "collaboration"));
  });
});
