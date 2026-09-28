import { createRequire, syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const [mode, source, databasePath, ...args] = process.argv.slice(2);

if (mode === "lock") {
  const { acquireDatabaseSyncLock } = await import(pathToFileURL(source).href);
  const release = acquireDatabaseSyncLock(databasePath);
  process.send?.({ locked: true });
  const end = Date.now() + Number(args[0]);
  while (Date.now() < end) {
    /* 隔离子进程中模拟同步 I/O 阻塞。 */
  }
  release();
  process.send?.({ released: true });
} else if (mode === "crash") {
  const fs = require("node:fs");
  const phase = args[0];
  const crash = () => {
    fs.writeSync(1, `PI_SYNC_CRASH_POINT:${phase}\n`);
    process.kill(process.pid, "SIGKILL");
  };
  const rename = fs.renameSync;
  const remove = fs.rmSync;
  fs.renameSync = (...values) => {
    rename(...values);
    const [from, to] = values.map(String);
    if (
      (phase === "journal" && to.endsWith(".session-sync.json")) ||
      (phase === "sessions-backup" && to.includes(".pre-session-sync-") && !to.endsWith(".bak")) ||
      (phase === "sessions-installed" && from.includes(".download-")) ||
      (phase === "database-installed" && from.endsWith(".download.tmp"))
    )
      crash();
  };
  fs.rmSync = (...values) => {
    remove(...values);
    if (phase === "committed" && String(values[0]).endsWith(".session-sync.json")) crash();
  };
  syncBuiltinESMExports();
  const { installSessionDownload } = await import(pathToFileURL(source).href);
  const Database = require(args[3]);
  installSessionDownload(
    databasePath,
    args[1],
    fs.readFileSync(args[2]),
    path => new Database(path, { readonly: true })
  );
  throw new Error("未命中预期崩溃点");
} else {
  throw new Error("未知验证模式");
}
