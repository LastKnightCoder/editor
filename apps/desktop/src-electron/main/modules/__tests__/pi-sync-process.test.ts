import { expect, it } from "vitest";
import { fork, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  acquireDatabaseSyncLock,
  assertDatabaseSyncLockOwned,
  packSessionDir,
  recoverSessionDownload,
} from "@tau/db-schema/sync";
import { writeSessionFile } from "../pi-session-files";

const fixture = fileURLToPath(
  new URL("../../../../scripts/pi-sync-process-fixture.mjs", import.meta.url)
);
const execArgv: string[] = [];
const lockSource = fileURLToPath(
  new URL("../../../../../../packages/db-schema/src/sync-lock.ts", import.meta.url)
);
const snapshotSource = fileURLToPath(
  new URL("../../../../../../packages/db-schema/src/session-snapshot.ts", import.meta.url)
);

it("锁目录被替换时立即撤销旧凭据，不必等下一次心跳", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-lock-identity-"));
  const file = join(dir, "data.db");
  writeFileSync(file, "隔离验证");
  const release = acquireDatabaseSyncLock(file);
  const replacement = mkdtempSync(join(dir, "replacement-"));
  try {
    assertDatabaseSyncLockOwned(file);
    rmSync(`${file}.lock`, { recursive: true });
    renameSync(replacement, `${file}.lock`);
    expect(() => assertDatabaseSyncLockOwned(file)).toThrow("失效");
    expect(() => release()).toThrow("失效");
    expect(existsSync(`${file}.lock`)).toBe(true);
  } finally {
    try {
      release();
    } catch {
      /* 旧凭据已失效，仍需清理隔离目录。 */
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

it("主线程阻塞超过一个心跳周期，独立线程仍续租且另一进程不能接管", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-lock-process-"));
  const path = join(dir, "data.db");
  writeFileSync(path, "隔离锁测试");
  const child = fork(fixture, ["lock", lockSource, path, "7000"], { execArgv, silent: true });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("message", () => resolve());
      child.once("error", reject);
      child.once("exit", code => {
        if (code) reject(new Error(`子进程退出 ${code}`));
      });
    });
    const before = statSync(`${path}.lock`).mtimeMs;
    await new Promise(resolve => setTimeout(resolve, 6000));
    expect(statSync(`${path}.lock`).mtimeMs).toBeGreaterThan(before);
    expect(() => acquireDatabaseSyncLock(path)).toThrow("正在同步");
    await new Promise<void>((resolve, reject) =>
      child.once("exit", code => (code === 0 ? resolve() : reject(new Error(`子进程退出 ${code}`))))
    );
    const release = acquireDatabaseSyncLock(path);
    release();
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15_000);

it.each(["journal", "sessions-backup", "sessions-installed", "database-installed", "committed"])(
  "真实 SIGKILL：%s 后恢复数据库和会话一致",
  phase => {
    const dir = mkdtempSync(join(tmpdir(), "pi-sync-crash-"));
    const databasePath = join(dir, "data.db");
    const sessions = join(dir, "sessions");
    const remote = join(dir, "remote");
    const writeDb = (path: string, marker: string) => {
      const db = new Database(path);
      db.exec("CREATE TABLE marker(value TEXT)");
      db.prepare("INSERT INTO marker VALUES (?)").run(marker);
      db.close();
    };
    const writeChat = (sessionDir: string, text: string) =>
      writeSessionFile({
        sessionDir,
        sessionId: "chat",
        createdAt: 1,
        cwd: dir,
        messages: [{ message: { role: "user", content: text, timestamp: 1 } }],
      });
    try {
      writeDb(databasePath, "local");
      writeDb(`${databasePath}.download.tmp`, "remote");
      const name = writeChat(sessions, "local");
      writeChat(remote, "remote");
      const archive = join(dir, "archive.zip");
      writeFileSync(archive, packSessionDir(remote));
      const native = createRequire(
        fileURLToPath(new URL("../../../../../collaboration-server/package.json", import.meta.url))
      ).resolve("better-sqlite3");
      const result = spawnSync(
        process.execPath,
        [
          ...execArgv,
          fixture,
          "crash",
          snapshotSource,
          databasePath,
          phase,
          sessions,
          archive,
          native,
        ],
        { encoding: "utf8" }
      );
      expect(result.stdout, result.stderr).toContain(`PI_SYNC_CRASH_POINT:${phase}`);
      expect(
        result.signal === "SIGKILL" || (process.platform === "win32" && result.status !== 0)
      ).toBe(true);
      recoverSessionDownload(databasePath);
      recoverSessionDownload(databasePath);
      const expected = phase === "committed" ? "remote" : "local";
      const db = new Database(databasePath);
      try {
        expect(db.prepare("SELECT value FROM marker").get()).toEqual({ value: expected });
      } finally {
        db.close();
      }
      expect(readFileSync(join(sessions, name), "utf8")).toContain(`"content":"${expected}"`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
);
