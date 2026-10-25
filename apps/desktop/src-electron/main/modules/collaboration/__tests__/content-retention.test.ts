import { CollaborationLocalStore } from "../local-store";
// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { ContentIdentityTable } from "../../tables/content-identity";
import { ContentLocalState } from "../content-local-state";
import { ContentRetention } from "../content-retention";
import { ContentRecoveryStore } from "../content-recovery";
import { contentRecoveryResources } from "../content-recovery-resources";
import { hasDurableEntityHold, registerDurableEntityHolds } from "../../durable-entity-holds";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run())
);
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-retention-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const state = new ContentLocalState(new CollaborationLocalStore(directory).db),
    db = new Database(":memory:");
  cleanup.push(() => {
    state.db.close();
    db.close();
  });
  db.exec(schema);
  const content = db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (?,1,1,?,0,0)"
  );
  content.run(1, JSON.stringify([{ type: "database", tableId: 43, children: [{ text: "" }] }]));
  content.run(2, "[]");
  content.run(3, "[]");
  const table = db.prepare(
    "INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES (?,1,1,?,?,0)"
  );
  table.run(
    42,
    JSON.stringify([{ id: "rich", title: "正文", type: "rich-text" }]),
    JSON.stringify([{ id: "row", rich: [{ contentId: 1 }], detailContentId: 2 }])
  );
  table.run(43, "[]", "[]");
  ContentIdentityTable.establishBaseline(db);
  const reference = ContentIdentityTable.bind(db, "data-table", 42, 1);
  state.replaceHolds("workspace", "room", "shared-membership", [reference]);
  return { db, state, reference, directory, retention: new ContentRetention(state) };
}

describe("本机持有的依赖回收仲裁", () => {
  it("恢复清单损坏只阻止所属库回收，无关资料库不读取该清单", () => {
    const { db, state, directory, retention } = setup();
    const recovery = new ContentRecoveryStore(directory, state);
    const receipt = recovery.save({
      workspaceId: "workspace",
      reason: "offline-edit",
      provenance: {},
      missing: [],
      files: [],
    });
    writeFileSync(receipt.manifestPath, "broken");
    expect(retention.has(db, "other", "content", 3)).toBe(false);
    expect(retention.has(db, "workspace", "content", 3)).toBe(true);
    expect(state.recovery(receipt.id)).toEqual(receipt);
  });
  it("旧登记从已验证清单补齐归属；旧损坏清单使用已登记持有范围", () => {
    const { db, state, directory, reference } = setup();
    const recovery = new ContentRecoveryStore(directory, state);
    const receipt = recovery.save({
      workspaceId: "workspace",
      reason: "offline-edit",
      provenance: {},
      missing: [],
      files: [],
    });
    state.db.prepare("UPDATE recoveries SET workspace_id=NULL WHERE id=?").run(receipt.id);
    new ContentRecoveryStore(directory, state);
    expect(
      state.db.prepare("SELECT workspace_id FROM recoveries WHERE id=?").get(receipt.id)
    ).toEqual({ workspace_id: "workspace" });
    state.db.prepare("UPDATE recoveries SET workspace_id=NULL WHERE id=?").run(receipt.id);
    state.replaceHolds("workspace", `recovery:${receipt.id}`, "recovery", [reference]);
    writeFileSync(receipt.manifestPath, "broken");
    const retention = new ContentRetention(state);
    expect(retention.has(db, "other", "content", 3)).toBe(false);
    expect(retention.has(db, "workspace", "data-table", 42)).toBe(true);
  });
  it("依赖闭包复用资源声明，保留单元格附件与正文图片，不把业务字符串当路径", () => {
    const { db, retention } = setup();
    db.prepare("UPDATE data_tables SET columns=?,rows=? WHERE id=43").run(
      JSON.stringify([
        { id: "image", type: "image" },
        { id: "file", type: "attachment" },
        { id: "text", type: "text" },
      ]),
      JSON.stringify([
        { image: [{ url: "/图片.png" }], file: [{ filePath: "/附件.pdf" }], text: "/不应读取.txt" },
      ])
    );
    db.prepare("UPDATE contents SET content=? WHERE id=2").run(
      JSON.stringify([{ type: "image", url: "/正文.png", children: [{ text: "" }] }])
    );
    const dependencies = retention.dependencies(db, "workspace");
    expect(dependencies).toEqual(
      expect.arrayContaining([
        { kind: "data-table", id: 43 },
        { kind: "content", id: 2 },
      ])
    );
    expect(contentRecoveryResources(db, dependencies).sort()).toEqual(
      ["/图片.png", "/正文.png", "/附件.pdf"].sort()
    );
  });
  it("表引用归零后仍保护单元格、行详情和嵌套实体，不改同步计数", () => {
    const { db, state, retention } = setup();
    expect(retention.has(db, "workspace", "data-table", 42)).toBe(true);
    expect(retention.has(db, "workspace", "data-table", 43)).toBe(true);
    expect(retention.has(db, "workspace", "content", 1)).toBe(true);
    expect(retention.has(db, "workspace", "content", 2)).toBe(true);
    expect(retention.has(db, "workspace", "content", 3)).toBe(false);
    expect(db.prepare("SELECT ref_count FROM contents WHERE id=1").get()).toEqual({ ref_count: 0 });
    state.replaceHolds("workspace", "room", "shared-membership", []);
    expect(retention.has(db, "workspace", "content", 1)).toBe(false);
  });

  it("不同来源不按同号记录保留或解析，解析损坏则暂停回收", () => {
    const { db, state, retention, reference } = setup();
    state.replaceHolds("workspace", "room", "shared-membership", [
      { ...reference, sourceId: "another-source" },
    ]);
    expect(retention.has(db, "workspace", "data-table", 42)).toBe(false);
    state.replaceHolds("workspace", "room", "shared-membership", [reference]);
    db.prepare("UPDATE data_tables SET rows='invalid' WHERE id=42").run();
    expect(retention.has(db, "workspace", "content", 3)).toBe(true);
    db.prepare("UPDATE data_tables SET rows='[]' WHERE id=42").run();
    expect(retention.has(db, "workspace", "content", 3)).toBe(false);
  });

  it("正文和白板持有提供者共同仲裁，不能按最后注册者覆盖", () => {
    const { db } = setup();
    const stopBoard = registerDurableEntityHolds((_db, _kind, id) => id === 1);
    const stopContent = registerDurableEntityHolds((_db, _kind, id) => id === 2, "content");
    try {
      expect(hasDurableEntityHold(db, "content", 1)).toBe(true);
      expect(hasDurableEntityHold(db, "content", 2)).toBe(true);
      expect(hasDurableEntityHold(db, "content", 3)).toBe(false);
    } finally {
      stopBoard();
      stopContent();
    }
    db.prepare(
      "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (1,'doc',2,'{}','r')"
    ).run();
    expect(hasDurableEntityHold(db, "content", 3)).toBe(true);
  });
});
