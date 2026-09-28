import lockfile from "proper-lockfile";
import { resolve } from "node:path";
import { createRequire as createSyncRequire } from "node:module";
import { rmdirSync, statSync } from "node:fs";
import { Worker } from "node:worker_threads";

const options = { realpath: false, stale: 120_000, update: 5_000 };
const owned = new Map<string, { state: Int32Array; ino: number; dev: number }>();

// 心跳属于独立线程，同步压缩、SQLite 迁移不会阻塞续租。
const workerSource = `
const { workerData, parentPort } = require('node:worker_threads');
const state = new Int32Array(workerData.state);
const notify = value => { Atomics.store(state, 0, value); Atomics.notify(state, 0); };
try {
  const lockfile = require(workerData.modulePath);
  const fs = require('node:fs');
  let identity;
  const checkIdentity = path => {
    if (!identity) return;
    const current = fs.statSync(path);
    if (current.ino !== identity.ino || current.dev !== identity.dev)
      throw Object.assign(new Error('同步锁身份已变化'), { code: 'ECOMPROMISED' });
  };
  const guardedFs = {
    ...fs,
    rmdirSync(path, ...args) { checkIdentity(path); return fs.rmdirSync(path, ...args); },
    utimesSync(path, ...args) { checkIdentity(path); return fs.utimesSync(path, ...args); },
  };
  const release = lockfile.lockSync(workerData.path, {
    ...workerData.options,
    fs: guardedFs,
    onCompromised: () => notify(5),
  });
  identity = fs.statSync(workerData.path + '.lock');
  notify(1);
  parentPort.on('message', () => {
    try { release(); notify(4); } catch { notify(5); }
    parentPort.close();
  });
} catch (error) { notify(error.code === 'ELOCKED' ? 2 : 3); parentPort.close(); }
`;

function lockModulePath(): string {
  const require = createSyncRequire(typeof __filename === "string" ? __filename : import.meta.url);
  try {
    return require.resolve("proper-lockfile");
  } catch {
    return createSyncRequire(require.resolve("@tau/db-schema/package.json")).resolve(
      "proper-lockfile"
    );
  }
}

/** 同一个库的桌面与 CLI 同步互斥；进程退出释放，崩溃遗留锁在心跳过期后可恢复。 */
export function acquireDatabaseSyncLock(databasePath: string): () => void {
  try {
    const path = resolve(databasePath);
    const state = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(workerSource, {
      eval: true,
      execArgv: [],
      workerData: {
        state: state.buffer,
        path,
        options,
        modulePath: lockModulePath(),
      },
    });
    worker.on("error", () => Atomics.store(state, 0, 5));
    if (Atomics.load(state, 0) === 0) Atomics.wait(state, 0, 0, 30000);
    const status = Atomics.load(state, 0);
    if (status !== 1) {
      void worker.terminate();
      throw new Error(status === 2 ? "此数据库正在同步，请稍后重试" : "同步锁初始化失败");
    }
    worker.unref();
    const identity = statSync(`${path}.lock`);
    owned.set(path, { state, ino: identity.ino, dev: identity.dev });
    const onExit = () => {
      try {
        const current = statSync(`${path}.lock`);
        if (
          Atomics.load(state, 0) === 1 &&
          current.ino === identity.ino &&
          current.dev === identity.dev
        )
          rmdirSync(`${path}.lock`);
      } catch {
        /* 崩溃遗留锁由过期协议处理。 */
      }
    };
    process.once("exit", onExit);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try {
        assertDatabaseSyncLockOwned(path);
        const before = Atomics.load(state, 0);
        worker.postMessage("release");
        if (before === 1) Atomics.wait(state, 0, 1, 30000);
        if (Atomics.load(state, 0) !== 4) throw new Error("同步锁已失效，操作已停止");
      } finally {
        owned.delete(path);
        process.removeListener("exit", onExit);
        void worker.terminate();
      }
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED")
      throw new Error("此数据库正在同步，请稍后重试");
    throw error;
  }
}

export const isDatabaseSyncLocked = (databasePath: string): boolean =>
  lockfile.checkSync(databasePath, options);

export function assertDatabaseNotSyncing(databasePath: string, allowOwned = false): void {
  if (allowOwned && owned.has(resolve(databasePath))) {
    assertDatabaseSyncLockOwned(databasePath);
    return;
  }
  if (isDatabaseSyncLocked(databasePath)) throw new Error("此数据库正在同步，请稍后重试");
}

export function assertDatabaseSyncLockOwned(databasePath: string): void {
  const path = resolve(databasePath);
  const lease = owned.get(path);
  try {
    const current = statSync(`${path}.lock`);
    if (
      lease &&
      Atomics.load(lease.state, 0) === 1 &&
      current.ino === lease.ino &&
      current.dev === lease.dev
    )
      return;
  } catch {
    /* 缺失的锁不能作为写入凭据。 */
  }
  throw new Error("同步锁已失效，禁止继续写入");
}
