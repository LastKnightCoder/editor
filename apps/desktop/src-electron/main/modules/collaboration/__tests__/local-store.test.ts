// @vitest-environment node
/** 协作缓存可重建：文件版本或单个设置值不可用时备份后自愈，设备身份等设置不丢。 */
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { CollaborationLocalStore } from "../local-store";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const workspace = () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-collab-store-"));
  directories.push(directory);
  return directory;
};

it.each([2, 9])("版本 %i 的缓存备份后新建，设置项迁进新库", version => {
  const directory = workspace();
  const old = new Database(join(directory, "collaboration.db"));
  old.exec(
    "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE sessions (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, state BLOB NOT NULL);"
  );
  old.prepare("INSERT INTO settings VALUES (?,?)").run("identity:https://collab", '"device"');
  old.prepare("INSERT INTO sessions VALUES (?,?,?)").run("doc", "{}", Buffer.from([1]));
  old.pragma(`user_version=${version}`);
  old.close();

  const store = new CollaborationLocalStore(directory);
  expect(store.get("identity:https://collab", null)).toBe("device");
  expect(store.db.pragma("user_version", { simple: true })).toBe(3);
  expect(store.db.prepare("SELECT count(*) AS count FROM sessions").get()).toEqual({ count: 0 });
  const backups = readdirSync(join(directory, "discarded"));
  expect(backups.some(name => name.includes(`version-${version}-collaboration.db`))).toBe(true);
  store.db.close();
});

it("读不出的设置值备份后按缺省处理", () => {
  const directory = workspace();
  const store = new CollaborationLocalStore(directory);
  store.db.prepare("INSERT INTO settings VALUES (?,?)").run("whiteboard-binding:lib:doc", "{oops");
  expect(store.get("whiteboard-binding:lib:doc", null)).toBeNull();
  const [backup] = readdirSync(join(directory, "discarded"));
  expect(JSON.parse(readFileSync(join(directory, "discarded", backup), "utf8"))).toEqual({
    key: "whiteboard-binding:lib:doc",
    value: "{oops",
  });
  expect(store.db.prepare("SELECT count(*) AS count FROM settings").get()).toEqual({ count: 0 });
  store.db.close();
});
