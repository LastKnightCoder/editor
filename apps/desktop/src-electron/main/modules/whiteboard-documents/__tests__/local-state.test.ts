// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { openWhiteboardState } from "../local-state";

const noNetwork = async () => {
  throw new Error("本机白板无需连接协作服务");
};

it("旧协作库里的白板绑定、发布记录、安装计划和附件迁移一次", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-whiteboard-state-"));
  const legacy = new CollaborationLocalStore(join(directory, "collaboration"));
  const key = "whiteboard-binding:library:board";
  legacy.set(key, { serverUrl: "https://example.test", documentId: "room" });
  legacy.set("identity:https://example.test", { id: "device" });
  legacy.db.exec(
    "CREATE TABLE whiteboard_publications (operation_id TEXT PRIMARY KEY,workspace_id TEXT,document_id TEXT,completed INTEGER,value TEXT)"
  );
  legacy.db
    .prepare("INSERT INTO whiteboard_publications VALUES(?,?,?,?,?)")
    .run(
      "publish",
      "library",
      "board",
      0,
      JSON.stringify({ operationId: "publish", roomId: "room" })
    );
  legacy.db
    .prepare("INSERT INTO migrations VALUES(?,?,?,?)")
    .run("install", "library", "board", JSON.stringify({ plan: { kind: "whiteboard" } }));
  const file = join(directory, "attachment.txt");
  writeFileSync(file, "原附件");
  const id = "4a4666f1-8bb0-4c9c-9998-9eac7d7d9c51";
  legacy.db
    .prepare("INSERT INTO resources VALUES(?,?,?,?,?,?)")
    .run(id, "board", "attachment.txt", "text/plain", file, 2);
  legacy.db.close();

  const first = openWhiteboardState(directory, noNetwork);
  try {
    expect(first.store.get(key, null)).toMatchObject({ documentId: "room" });
    expect(first.store.get("identity:https://example.test", null)).toBeNull();
    expect(
      first.store.db.prepare("SELECT operation_id FROM whiteboard_publications").get()
    ).toEqual({ operation_id: "publish" });
    expect(first.store.db.prepare("SELECT operation_id FROM migrations").get()).toEqual({
      operation_id: "install",
    });
    await expect(
      first.assets.resolveReference("", "board", `tau-collab-local:${id}`)
    ).resolves.toBe(file);
    first.store.delete(key);
  } finally {
    first.store.db.close();
  }
  const reopened = openWhiteboardState(directory, noNetwork);
  try {
    expect(reopened.store.get(key, null)).toBeNull();
    expect(
      reopened.store.db.prepare("SELECT count(*) AS n FROM whiteboard_publications").get()
    ).toEqual({ n: 1 });
  } finally {
    reopened.store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("旧协作库不可读时保留文件，独立状态仍支持本机资源保存和重开", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-whiteboard-corrupt-store-"));
  mkdirSync(join(directory, "collaboration"));
  const old = join(directory, "collaboration", "collaboration.db");
  writeFileSync(old, "损坏协作库夹具");
  const first = openWhiteboardState(directory, noNetwork);
  let reference: string;
  try {
    reference = await first.assets.keepLocalFile("board", {
      name: "media.txt",
      mime: "text/plain",
      bytes: Buffer.from("本机资源"),
    });
  } finally {
    first.store.db.close();
  }
  const reopened = openWhiteboardState(directory, noNetwork);
  try {
    const path = await reopened.assets.resolveReference("", "board", reference);
    expect(readFileSync(path, "utf8")).toBe("本机资源");
    expect(readFileSync(old, "utf8")).toBe("损坏协作库夹具");
  } finally {
    reopened.store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
