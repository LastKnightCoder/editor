import { pathToFileURL } from "node:url";
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
} else {
  throw new Error("未知验证模式");
}
