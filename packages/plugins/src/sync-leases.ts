import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import { assertLocalId } from "./ids";

async function guarded<T>(directory: string, id: string, run: (root: string) => Promise<T>) {
  assertLocalId(id);
  const root = path.join(directory, ".sync-tasks", id);
  await mkdir(root, { recursive: true });
  const release = await lockfile.lock(root, {
    retries: { retries: 50, minTimeout: 10, maxTimeout: 100 },
  });
  try {
    return await run(root);
  } finally {
    await release();
  }
}

async function active(root: string) {
  let count = 0;
  for (const name of await readdir(root)) {
    if (!/^\d+-[a-f0-9-]+$/.test(name)) continue;
    const pid = Number(name.split("-")[0]);
    try {
      process.kill(pid, 0);
      count++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      await rm(path.join(root, name), { force: true });
    }
  }
  return count > 0;
}

/** 占用只记录进程身份；CLI崩溃后由下一次操作清理，不保存配置或凭据。 */
export async function acquirePluginSyncLease(directory: string, id: string) {
  const name = `${process.pid}-${randomUUID()}`;
  const file = await guarded(directory, id, async root => {
    const file = path.join(root, name);
    await writeFile(file, "", { flag: "wx" });
    return file;
  });
  return () => rm(file, { force: true });
}

export function withPluginSyncMutation<T>(directory: string, id: string, run: () => Promise<T>) {
  return guarded(directory, id, async root => {
    if (await active(root)) throw new Error("插件有正在进行的同步任务，请结束后再修改");
    return run();
  });
}

export async function hasPluginSyncLeases(directory: string) {
  const parent = path.join(directory, ".sync-tasks");
  const entries = await readdir(parent, { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      !entry.name.endsWith(".lock") &&
      (await guarded(directory, entry.name, active))
    )
      return true;
  }
  return false;
}
