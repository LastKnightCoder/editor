// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it, vi } from "vitest";
import { upgradeOfficialSyncPlugin } from "../plugin-sync-upgrade";
import type { PluginUpdates } from "../plugin-updates";

it.each([
  "null",
  "broken json",
  JSON.stringify({ id: "tau.sync-s3", version: "0.1.2", main: "main.js", sync: "sync.js" }),
])("未知或修改过的旧包不被自动覆盖：%s", async raw => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-upgrade-"));
  const target = path.join(root, "plugins/tau.sync-s3");
  const stageBundledPackage = vi.fn();
  try {
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "manifest.json"), raw);
    await writeFile(path.join(target, "main.js"), "user content");
    expect(
      await upgradeOfficialSyncPlugin(path.join(root, "bundled"), path.join(root, "plugins"), {
        stageBundledPackage,
      } as unknown as PluginUpdates)
    ).toBe(false);
    expect(stageBundledPackage).not.toHaveBeenCalled();
    expect(await readFile(path.join(target, "main.js"), "utf8")).toBe("user content");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
