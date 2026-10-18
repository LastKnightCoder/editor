import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { acquirePluginSyncLease, hasPluginSyncLeases, withPluginSyncMutation } from "./sync-leases";

it("并发任务共同占用插件，最后一轮结束后才允许修改", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-leases-"));
  try {
    const first = await acquirePluginSyncLease(root, "test.sync");
    const second = await acquirePluginSyncLease(root, "test.sync");
    await expect(withPluginSyncMutation(root, "test.sync", async () => true)).rejects.toThrow(
      "同步任务"
    );
    await first();
    expect(await hasPluginSyncLeases(root)).toBe(true);
    await second();
    expect(await withPluginSyncMutation(root, "test.sync", async () => "ok")).toBe("ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("其他进程占用可见，崩溃退出的遗留记录自动回收", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-leases-process-"));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const output = path.join(root, "lease.cjs");
    await build({
      stdin: {
        contents: `import { acquirePluginSyncLease } from './sync-leases'; acquirePluginSyncLease(process.argv[2], 'test.sync').then(() => { process.send('ready'); setInterval(() => {}, 1000); });`,
        resolveDir: import.meta.dirname,
      },
      outfile: output,
      bundle: true,
      platform: "node",
      format: "cjs",
    });
    child = spawn(process.execPath, [output, root], {
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    await once(child, "message");
    await expect(withPluginSyncMutation(root, "test.sync", async () => true)).rejects.toThrow(
      "同步任务"
    );
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    expect(await hasPluginSyncLeases(root)).toBe(false);
    expect(await withPluginSyncMutation(root, "test.sync", async () => true)).toBe(true);
  } finally {
    child?.kill();
    await rm(root, { recursive: true, force: true });
  }
});
